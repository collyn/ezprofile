import * as crypto from 'crypto';
import * as path from 'path';
import { app } from 'electron';

const PBKDF2_ITERATIONS = 200_000;
const PBKDF2_DIGEST = 'sha256';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12;  // 96 bits — GCM recommended
const TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32;

export interface EncryptedPayload {
  iv: Buffer;
  ciphertext: Buffer;
  tag: Buffer;
}

export class EncryptionService {
  private _machineKey: Buffer | null = null;

  /**
   * Derive a 256-bit key from a passphrase + salt using PBKDF2.
   * This is async to avoid blocking the main thread.
   */
  deriveKey(passphrase: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(passphrase, salt, PBKDF2_ITERATIONS, KEY_LENGTH, PBKDF2_DIGEST, (err, key) => {
        if (err) reject(err);
        else resolve(key);
      });
    });
  }

  /**
   * Generate a new random salt for PBKDF2.
   */
  generateSalt(): Buffer {
    return crypto.randomBytes(SALT_LENGTH);
  }

  /**
   * Encrypt a Buffer using AES-256-GCM.
   * Returns iv, ciphertext, and auth tag.
   */
  encrypt(data: Buffer, key: Buffer): EncryptedPayload {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
    const tag = cipher.getAuthTag();
    return { iv, ciphertext, tag };
  }

  /**
   * Decrypt an AES-256-GCM payload.
   * Throws if the auth tag is invalid (tampered data or wrong key).
   */
  decrypt(payload: EncryptedPayload, key: Buffer): Buffer {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, payload.iv);
    decipher.setAuthTag(payload.tag);
    return Buffer.concat([decipher.update(payload.ciphertext), decipher.final()]);
  }

  /**
   * Serialize an EncryptedPayload to a single Buffer: iv || tag || ciphertext
   */
  serializePayload(payload: EncryptedPayload): Buffer {
    return Buffer.concat([payload.iv, payload.tag, payload.ciphertext]);
  }

  /**
   * Deserialize a Buffer created by serializePayload().
   */
  deserializePayload(buf: Buffer): EncryptedPayload {
    const iv = buf.subarray(0, IV_LENGTH);
    const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = buf.subarray(IV_LENGTH + TAG_LENGTH);
    return { iv, tag, ciphertext };
  }

  // ──────────────────────────────────────────
  // Machine-bound encryption for credentials at rest
  // ──────────────────────────────────────────

  /**
   * A deterministic key derived from the app's userData path.
   * This is NOT cryptographically strong against an attacker
   * with full filesystem access, but it prevents naive plaintext
   * reading of stored credentials.
   */
  getMachineKey(): Buffer {
    if (this._machineKey) return this._machineKey;
    const seed = app.getPath('userData') + process.platform + require('os').hostname();
    this._machineKey = crypto.createHash('sha256').update(seed).digest();
    return this._machineKey;
  }

  /**
   * Encrypt a string (e.g. credential) using the machine key.
   * Returns a hex string for storage in SQLite settings.
   */
  encryptString(text: string, machineKey?: Buffer): string {
    const key = machineKey ?? this.getMachineKey();
    const payload = this.encrypt(Buffer.from(text, 'utf-8'), key);
    return this.serializePayload(payload).toString('hex');
  }

  /**
   * Decrypt a hex string stored by encryptString().
   */
  decryptString(hex: string, machineKey?: Buffer): string {
    const key = machineKey ?? this.getMachineKey();
    const buf = Buffer.from(hex, 'hex');
    const payload = this.deserializePayload(buf);
    return this.decrypt(payload, key).toString('utf-8');
  }
}
