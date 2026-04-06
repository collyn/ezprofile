import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { EncryptionService } from './encryption-service';
import { ProfileManager } from './profile-manager';

export interface S3Config {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
  prefix: string; // e.g. "ezprofile/"
  endpoint?: string;
}

export interface BackupEntry {
  id: string;      // s3Key
  profileId: string;
  profileName: string;
  createdAt: string;
  sizeBytes: number;
  provider: 's3';
  isSync: boolean;
}

export class S3Service {
  private client: S3Client | null = null;
  private config: S3Config | null = null;

  constructor(
    private encryptionSvc: EncryptionService,
    private profileManager: ProfileManager
  ) {}

  // ──────────────────────────────────────────
  // Configuration
  // ──────────────────────────────────────────

  configure(config: S3Config): void {
    this.config = config;

    let parsedEndpoint = config.endpoint?.trim() || undefined;
    if (parsedEndpoint) {
      if (!/^https?:\/\//i.test(parsedEndpoint)) {
        parsedEndpoint = `https://${parsedEndpoint}`;
      }
      parsedEndpoint = parsedEndpoint.replace(/\/+$/, '');
    }

    this.client = new S3Client({
      region: config.region || 'auto',
      endpoint: parsedEndpoint,
      forcePathStyle: !!parsedEndpoint, // Often required for S3-compatible like R2/MinIO
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  /**
   * Load config from DB settings and rebuild client.
   */
  loadFromSettings(): boolean {
    const ak = this.profileManager.getSetting('s3_access_key_id');
    const skEnc = this.profileManager.getSetting('s3_secret_access_key');
    const bucket = this.profileManager.getSetting('s3_bucket');
    const region = this.profileManager.getSetting('s3_region') || 'auto';
    const prefix = this.profileManager.getSetting('s3_prefix') ?? 'ezprofile/';
    const endpoint = this.profileManager.getSetting('s3_endpoint');

    if (!ak || !skEnc || !bucket) return false;

    try {
      const sk = this.encryptionSvc.decryptString(skEnc);
      this.configure({ accessKeyId: ak, secretAccessKey: sk, bucket, region, prefix, endpoint: endpoint || undefined });
      return true;
    } catch {
      return false;
    }
  }

  saveToSettings(config: S3Config): void {
    this.profileManager.setSetting('s3_access_key_id', config.accessKeyId);
    if (config.secretAccessKey && config.secretAccessKey.trim().length > 0) {
      const machineKey = this.encryptionSvc.getMachineKey();
      this.profileManager.setSetting('s3_secret_access_key', this.encryptionSvc.encryptString(config.secretAccessKey.trim(), machineKey));
    } else {
      const skEnc = this.profileManager.getSetting('s3_secret_access_key');
      if (skEnc) {
        try {
          config.secretAccessKey = this.encryptionSvc.decryptString(skEnc);
        } catch {
          // ignore
        }
      }
    }
    this.profileManager.setSetting('s3_bucket', config.bucket);
    this.profileManager.setSetting('s3_region', config.region || 'auto');
    this.profileManager.setSetting('s3_prefix', config.prefix || 'ezprofile/');
    this.profileManager.setSetting('s3_endpoint', config.endpoint || '');
    this.configure(config);
  }

  getStoredConfig(): Omit<S3Config, 'secretAccessKey'> & { hasSecret: boolean } | null {
    const ak = this.profileManager.getSetting('s3_access_key_id');
    const bucket = this.profileManager.getSetting('s3_bucket');
    const region = this.profileManager.getSetting('s3_region') || 'auto';
    const prefix = this.profileManager.getSetting('s3_prefix') ?? 'ezprofile/';
    const endpoint = this.profileManager.getSetting('s3_endpoint');
    const hasSecret = !!this.profileManager.getSetting('s3_secret_access_key');
    if (!ak || !bucket) return null;
    return { accessKeyId: ak, bucket, region, prefix, endpoint: endpoint || undefined, hasSecret };
  }

  // ──────────────────────────────────────────
  // Operations
  // ──────────────────────────────────────────

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    if (!this.client || !this.config) return { success: false, error: 'Not configured' };
    try {
      // HeadBucket often fails with UnknownError/Forbidden on scoped tokens (R2, etc)
      await this.client.send(new ListObjectsV2Command({ Bucket: this.config.bucket, MaxKeys: 1 }));
      return { success: true };
    } catch (err: any) {
      console.error('[S3 testConnection] Failed:', err);
      const statusCode = err.$metadata?.httpStatusCode;
      const msg = statusCode
        ? `HTTP ${statusCode}: ${err.name || 'Error'} - ${err.message}`
        : err.message ?? String(err);
      return { success: false, error: msg };
    }
  }

  async uploadFile(localPath: string, s3Key: string, onProgress?: (bytes: number) => void): Promise<void> {
    this.assertConfigured();
    const fileContent = fs.readFileSync(localPath);
    await this.client!.send(
      new PutObjectCommand({
        Bucket: this.config!.bucket,
        Key: s3Key,
        Body: fileContent,
        ContentType: 'application/octet-stream',
      })
    );
  }

  async downloadFile(s3Key: string, localPath: string): Promise<void> {
    this.assertConfigured();
    const response = await this.client!.send(
      new GetObjectCommand({ Bucket: this.config!.bucket, Key: s3Key })
    );
    const body = response.Body as Readable;
    const dest = fs.createWriteStream(localPath);
    await new Promise<void>((resolve, reject) => {
      body.pipe(dest);
      body.on('error', reject);
      dest.on('finish', resolve);
    });
  }

  async listBackups(profileId?: string): Promise<BackupEntry[]> {
    this.assertConfigured();
    const prefix = profileId ? `${this.config!.prefix}${profileId}/` : this.config!.prefix;
    const response = await this.client!.send(
      new ListObjectsV2Command({ Bucket: this.config!.bucket, Prefix: prefix })
    );

    const entries: BackupEntry[] = [];
    for (const obj of response.Contents ?? []) {
      if (!obj.Key) continue;
      const parsed = this.parseS3Key(obj.Key);
      if (!parsed) continue;
      entries.push({
        id: obj.Key,
        profileId: parsed.profileId,
        profileName: parsed.profileName,
        createdAt: parsed.createdAt,
        sizeBytes: obj.Size ?? 0,
        provider: 's3',
        isSync: parsed.isSync,
      });
    }

    return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async deleteBackup(s3Key: string): Promise<void> {
    this.assertConfigured();
    await this.client!.send(
      new DeleteObjectCommand({ Bucket: this.config!.bucket, Key: s3Key })
    );
  }

  buildS3Key(profileId: string, profileName: string, options?: { isSync?: boolean; timestamp?: number }): string {
    const prefix = this.profileManager.getSetting('sync_s3_prefix') || 'ezprofile/';
    const safeName = profileName.replace(/[^a-zA-Z0-9_-]/g, '_');
    if (options?.isSync) return `${prefix}${profileId}/${safeName}_sync.ezpsync`;
    const ts = options?.timestamp ?? Date.now();
    return `${prefix}${profileId}/${safeName}_${ts}.ezpsync`;
  }

  // ──────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────

  private assertConfigured(): void {
    if (!this.client || !this.config) throw new Error('S3 not configured. Please set credentials in Settings.');
  }

  private parseS3Key(key: string): { profileId: string; profileName: string; createdAt: string; isSync: boolean } | null {
    /*
     * Key format: {prefix}{profileId}/{profileName}_{timestamp}.ezpsync
     * e.g. ezprofile/abc-123/My_Profile_1712345678901.ezpsync
     */
    const parts = key.split('/');
    if (parts.length < 3) return null;
    const fileName = parts[parts.length - 1];
    const profileId = parts[parts.length - 2];

    const match = fileName.match(/^(.+)_(\d+|sync)\.ezpsync$/);
    if (!match) return null;

    const profileName = match[1].replace(/_/g, ' ');
    const isSync = match[2] === 'sync';
    const ts = isSync ? Date.now() : parseInt(match[2], 10);
    const createdAt = new Date(ts).toISOString();

    return { profileId, profileName, createdAt, isSync };
  }
}
