/**
 * GDriveService — PKCE OAuth2 flow (no client secret required)
 *
 * Security model:
 *  - User provides their OWN Google Cloud Client ID (Desktop app type)
 *  - PKCE (RFC 7636) replaces the client_secret entirely
 *  - Even if Client ID is known, it's useless without user consent via Google's UI
 *  - Tokens stored encrypted with machine-bound key
 */

import * as http from 'http';
import * as url from 'url';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { shell } from 'electron';
import { Readable } from 'stream';
import { EncryptionService } from './encryption-service';
import { ProfileManager } from './profile-manager';

const SCOPES = ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/userinfo.email'].join(' ');
const LOOPBACK_PORT = 42813;
const REDIRECT_URI = `http://localhost:${LOOPBACK_PORT}/oauth/callback`;
const SYNC_FOLDER_NAME = 'EzProfile Sync';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_DRIVE_API = 'https://www.googleapis.com/drive/v3';
const GOOGLE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const GOOGLE_USERINFO_API = 'https://www.googleapis.com/oauth2/v2/userinfo';

export interface GDriveBackupEntry {
  id: string;         // Google Drive fileId
  profileId: string;
  profileName: string;
  createdAt: string;
  sizeBytes: number;
  provider: 'googledrive';
  isSync: boolean;
}

interface TokenData {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  email?: string;
}

// ─────────────────────────────────────────────────────────────
// PKCE helpers
// ─────────────────────────────────────────────────────────────

function generateCodeVerifier(): string {
  return crypto.randomBytes(48).toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// ─────────────────────────────────────────────────────────────
// Lightweight Drive HTTP client (no googleapis dependency)
// ─────────────────────────────────────────────────────────────

async function driveRequest(
  method: 'GET' | 'POST' | 'DELETE' | 'PATCH',
  endpoint: string,
  accessToken: string,
  params?: Record<string, string>,
  body?: any,
  contentType?: string
): Promise<any> {
  const { default: fetch } = await import('node-fetch');

  let fullUrl = endpoint;
  if (params) {
    const qs = new URLSearchParams(params).toString();
    fullUrl += (fullUrl.includes('?') ? '&' : '?') + qs;
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
  };
  if (contentType) headers['Content-Type'] = contentType;

  const res = await fetch(fullUrl, {
    method,
    headers,
    body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive API error ${res.status}: ${text}`);
  }
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

// ─────────────────────────────────────────────────────────────
// Service class
// ─────────────────────────────────────────────────────────────

export class GDriveService {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private expiryDate: number = 0;

  constructor(
    private encryptionSvc: EncryptionService,
    private profileManager: ProfileManager
  ) {
    this.loadStoredToken();
  }

  // ──────────────────────────────────────────
  // Client ID management
  // ──────────────────────────────────────────

  getClientId(): string | null {
    return this.profileManager.getSetting('gdrive_client_id') || null;
  }

  saveClientId(clientId: string): void {
    this.profileManager.setSetting('gdrive_client_id', clientId.trim());
  }

  getClientSecret(): string | null {
    const enc = this.profileManager.getSetting('gdrive_client_secret_enc');
    if (!enc) return null;
    try { return this.encryptionSvc.decryptString(enc); } catch { return null; }
  }

  saveClientSecret(secret: string): void {
    const enc = this.encryptionSvc.encryptString(secret.trim());
    this.profileManager.setSetting('gdrive_client_secret_enc', enc);
  }

  // ──────────────────────────────────────────
  // PKCE OAuth2 flow
  // ──────────────────────────────────────────

  async authenticate(): Promise<{ email: string }> {
    const clientId = this.getClientId();
    if (!clientId) {
      throw new Error('Google Client ID not configured. Please enter your Client ID in Settings.');
    }
    const clientSecret = this.getClientSecret();
    if (!clientSecret) {
      throw new Error('Google Client Secret not configured. Please enter your Client Secret in Settings.');
    }

    // 1. Generate PKCE pair
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    // 2. Build auth URL
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: SCOPES,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      access_type: 'offline',
      prompt: 'consent',
    });

    const authUrl = `${GOOGLE_AUTH_URL}?${params.toString()}`;
    await shell.openExternal(authUrl);

    // 3. Wait for callback code
    const code = await this.waitForOAuthCode();

    // 4. Exchange code → tokens
    // Google requires client_secret for Desktop app type (it's a "public secret" — safe to ship)
    // PKCE (code_verifier) provides additional security against code interception
    const { default: fetch } = await import('node-fetch');
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,  // PKCE: prevents code interception attacks
      }).toString(),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      throw new Error(`Token exchange failed: ${err}`);
    }

    const tokens: any = await tokenRes.json();
    this.setTokens(tokens);

    // 5. Fetch user email
    let email = 'Connected';
    try {
      const info = await driveRequest('GET', GOOGLE_USERINFO_API, this.accessToken!);
      email = info.email ?? 'Connected';
    } catch {}

    // 6. Persist tokens (encrypted)
    const tokenData: TokenData = {
      access_token: this.accessToken!,
      refresh_token: this.refreshToken!,
      expiry_date: this.expiryDate,
      email,
    };
    this.saveToken(tokenData);

    return { email };
  }

  async revokeAuth(): Promise<void> {
    if (this.accessToken) {
      try {
        const { default: fetch } = await import('node-fetch');
        await fetch(`https://oauth2.googleapis.com/revoke?token=${this.accessToken}`, { method: 'POST' });
      } catch {}
    }
    this.accessToken = null;
    this.refreshToken = null;
    this.expiryDate = 0;
    this.profileManager.setSetting('gdrive_token_json', '');
    this.profileManager.setSetting('gdrive_folder_id', '');
  }

  getAuthStatus(): { connected: boolean; email?: string } {
    const tokenJson = this.profileManager.getSetting('gdrive_token_json');
    if (!tokenJson) return { connected: false };
    try {
      const decrypted = this.encryptionSvc.decryptString(tokenJson);
      const data: TokenData = JSON.parse(decrypted);
      if (!data.access_token && !data.refresh_token) return { connected: false };
      return { connected: true, email: data.email };
    } catch {
      return { connected: false };
    }
  }

  // ──────────────────────────────────────────
  // Token refresh
  // ──────────────────────────────────────────

  private async refreshAccessToken(): Promise<void> {
    if (!this.refreshToken) throw new Error('No refresh token available. Please re-authenticate.');

    const clientId = this.getClientId();
    if (!clientId) throw new Error('Google Client ID not configured');
    const clientSecret = this.getClientSecret();
    if (!clientSecret) throw new Error('Google Client Secret not configured');

    const { default: fetch } = await import('node-fetch');
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Token refresh failed: ${err}`);
    }

    const tokens: any = await res.json();
    this.setTokens(tokens);

    // Persist updated tokens
    const existing = this.loadTokenData();
    if (existing) {
      existing.access_token = this.accessToken!;
      existing.expiry_date = this.expiryDate;
      this.saveToken(existing);
    }
  }

  private async ensureValidToken(): Promise<string> {
    if (!this.accessToken && !this.refreshToken) {
      this.loadStoredToken();
    }
    if (!this.accessToken && !this.refreshToken) {
      throw new Error('Not authenticated. Please connect Google Drive in Settings.');
    }
    // Refresh if expired (with 60s buffer)
    if (Date.now() >= this.expiryDate - 60_000) {
      await this.refreshAccessToken();
    }
    return this.accessToken!;
  }

  // ──────────────────────────────────────────
  // Drive operations
  // ──────────────────────────────────────────

  async getOrCreateSyncFolder(): Promise<string> {
    const stored = this.profileManager.getSetting('gdrive_folder_id');
    const token = await this.ensureValidToken();

    if (stored) {
      try {
        await driveRequest('GET', `${GOOGLE_DRIVE_API}/files/${stored}`, token, { fields: 'id' });
        return stored;
      } catch {
        // Folder gone, recreate
      }
    }

    // Search existing
    const listRes = await driveRequest('GET', `${GOOGLE_DRIVE_API}/files`, token, {
      q: `name='${SYNC_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id,name)',
    });

    let folderId: string;
    if (listRes.files?.length > 0) {
      folderId = listRes.files[0].id;
    } else {
      const created = await driveRequest('POST', `${GOOGLE_DRIVE_API}/files`, token, undefined, {
        name: SYNC_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
      }, 'application/json');
      folderId = created.id;
    }

    this.profileManager.setSetting('gdrive_folder_id', folderId);
    return folderId;
  }

  async uploadFile(localPath: string, remoteFileName: string): Promise<string> {
    const token = await this.ensureValidToken();
    const folderId = await this.getOrCreateSyncFolder();
    
    // Google Drive allows duplicate filenames. To emulate S3's overwrite behavior,
    // we delete any existing file with the exact same name in our sync folder first.
    try {
      const searchRes = await driveRequest('GET', `${GOOGLE_DRIVE_API}/files`, token, {
        q: `'${folderId}' in parents and name='${remoteFileName}' and trashed=false`
      });
      if (searchRes.files && searchRes.files.length > 0) {
        for (const f of searchRes.files) {
          await this.deleteBackup(f.id);
        }
      }
    } catch (e) {
      console.warn(`[GDrive] Failed to check for existing file ${remoteFileName}:`, e);
    }

    const { default: fetch } = await import('node-fetch');

    const fileData = fs.readFileSync(localPath);
    const stat = fs.statSync(localPath);

    // Multipart upload
    const boundary = '-------ezprofile_boundary';
    const metadata = JSON.stringify({ name: remoteFileName, parents: [folderId] });

    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`),
      Buffer.from(metadata),
      Buffer.from(`\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`),
      fileData,
      Buffer.from(`\r\n--${boundary}--`),
    ]);

    const res = await fetch(`${GOOGLE_UPLOAD_API}/files?uploadType=multipart&fields=id`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary="${boundary}"`,
        'Content-Length': String(body.length),
      },
      body,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Drive upload failed: ${err}`);
    }

    const json: any = await res.json();
    return json.id;
  }

  async downloadFile(fileId: string, localPath: string): Promise<void> {
    const token = await this.ensureValidToken();
    const { default: fetch } = await import('node-fetch');

    const res = await fetch(`${GOOGLE_DRIVE_API}/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error(`Drive download failed: ${res.status}`);

    const dest = fs.createWriteStream(localPath);
    await new Promise<void>((resolve, reject) => {
      res.body!.pipe(dest);
      res.body!.on('error', reject);
      dest.on('finish', resolve);
    });
  }

  async uploadBuffer(buffer: Buffer, remoteFileName: string): Promise<string> {
    const token = await this.ensureValidToken();
    const folderId = await this.getOrCreateSyncFolder();
    
    try {
      const searchRes = await driveRequest('GET', `${GOOGLE_DRIVE_API}/files`, token, {
        q: `'${folderId}' in parents and name='${remoteFileName}' and trashed=false`
      });
      if (searchRes.files && searchRes.files.length > 0) {
        for (const f of searchRes.files) {
          await this.deleteBackup(f.id);
        }
      }
    } catch (e) {
      console.warn(`[GDrive] Failed to check for existing file ${remoteFileName}:`, e);
    }

    const { default: fetch } = await import('node-fetch');

    const boundary = '-------ezprofile_boundary';
    const metadata = JSON.stringify({ name: remoteFileName, parents: [folderId] });

    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`),
      Buffer.from(metadata),
      Buffer.from(`\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`),
      buffer,
      Buffer.from(`\r\n--${boundary}--`),
    ]);

    const res = await fetch(`${GOOGLE_UPLOAD_API}/files?uploadType=multipart&fields=id`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary="${boundary}"`,
        'Content-Length': String(body.length),
      },
      body,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Drive upload failed: ${err}`);
    }

    const json: any = await res.json();
    return json.id;
  }

  async downloadBufferByFileName(fileName: string): Promise<Buffer | null> {
    const token = await this.ensureValidToken();
    const folderId = await this.getOrCreateSyncFolder();
    
    const searchRes = await driveRequest('GET', `${GOOGLE_DRIVE_API}/files`, token, {
       q: `'${folderId}' in parents and name='${fileName}' and trashed=false`
    });
    if (!searchRes.files || searchRes.files.length === 0) return null;
    
    const fileId = searchRes.files[0].id;
    const { default: fetch } = await import('node-fetch');

    const res = await fetch(`${GOOGLE_DRIVE_API}/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error(`Drive download failed: ${res.status}`);

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async listBackups(profileId?: string): Promise<GDriveBackupEntry[]> {
    const token = await this.ensureValidToken();
    const folderId = await this.getOrCreateSyncFolder();

    const query = profileId 
      ? `'${folderId}' in parents and name contains '${profileId}' and trashed=false`
      : `'${folderId}' in parents and trashed=false`;

    const res = await driveRequest('GET', `${GOOGLE_DRIVE_API}/files`, token, {
      q: query,
      fields: 'files(id,name,size,createdTime)',
      orderBy: 'createdTime desc',
    });

    const entries: GDriveBackupEntry[] = [];
    for (const file of res.files ?? []) {
      const parsed = this.parseFileName(file.name ?? '');
      if (!parsed) continue;
      entries.push({
        id: file.id,
        profileId: parsed.profileId,
        profileName: parsed.profileName,
        createdAt: file.createdTime ?? new Date().toISOString(),
        sizeBytes: parseInt(file.size ?? '0', 10),
        provider: 'googledrive',
        isSync: parsed.isSync,
      });
    }
    return entries;
  }

  async deleteBackup(fileId: string): Promise<void> {
    const token = await this.ensureValidToken();
    const { default: fetch } = await import('node-fetch');
    await fetch(`${GOOGLE_DRIVE_API}/files/${fileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  buildFileName(profileId: string, profileName: string, options?: { isSync?: boolean; timestamp?: number }): string {
    const safeName = profileName.replace(/[^a-zA-Z0-9_-]/g, '_');
    if (options?.isSync) return `${profileId}_${safeName}_sync.ezpsync`;
    const ts = options?.timestamp ?? Date.now();
    return `${profileId}_${safeName}_${ts}.ezpsync`;
  }

  // ──────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────

  private setTokens(tokens: any): void {
    this.accessToken = tokens.access_token ?? null;
    if (tokens.refresh_token) this.refreshToken = tokens.refresh_token;
    this.expiryDate = tokens.expiry_date ?? (Date.now() + (tokens.expires_in ?? 3600) * 1000);
  }

  private async waitForOAuthCode(): Promise<string> {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        const host = req.headers.host || '127.0.0.1:3456';
        const reqUrl = new URL(req.url || '/', `http://${host}`);
        if (reqUrl.pathname !== '/oauth/callback') {
          res.writeHead(404); res.end(); return;
        }

        const code = reqUrl.searchParams.get('code');
        const error = reqUrl.searchParams.get('error');

        const html = error
          ? `<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h2>❌ Authentication failed</h2><p>${error}</p><p>You can close this tab.</p></body></html>`
          : `<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h2 style="color:#34a853">✅ EzProfile connected to Google Drive!</h2><p>You can close this tab and return to EzProfile.</p></body></html>`;

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        server.close();

        if (error) reject(new Error(`OAuth error: ${error}`));
        else if (typeof code === 'string') resolve(code);
        else reject(new Error('No code received'));
      });

      server.on('error', (err) => reject(err));
      server.listen(LOOPBACK_PORT, '127.0.0.1');

      // 5 minute timeout
      setTimeout(() => { server.close(); reject(new Error('OAuth timeout — no response within 5 minutes')); }, 5 * 60 * 1000);
    });
  }

  private saveToken(data: TokenData): void {
    const encrypted = this.encryptionSvc.encryptString(JSON.stringify(data));
    this.profileManager.setSetting('gdrive_token_json', encrypted);
  }

  private loadStoredToken(): void {
    const data = this.loadTokenData();
    if (!data) return;
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;
    this.expiryDate = data.expiry_date;
  }

  private loadTokenData(): TokenData | null {
    const tokenJson = this.profileManager.getSetting('gdrive_token_json');
    if (!tokenJson) return null;
    try {
      const decrypted = this.encryptionSvc.decryptString(tokenJson);
      return JSON.parse(decrypted) as TokenData;
    } catch { return null; }
  }

  private parseFileName(name: string): { profileId: string; profileName: string; isSync: boolean } | null {
    const match = name.match(/^([a-f0-9-]{36})_(.+)_(\d+|sync)\.ezpsync$/);
    if (!match) return null;
    return { profileId: match[1], profileName: match[2].replace(/_/g, ' '), isSync: match[3] === 'sync' };
  }
}
