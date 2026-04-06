import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import Database from 'better-sqlite3';

const CHROME_SALT = 'saltysalt';
const CHROME_IV = Buffer.alloc(16, ' '); // 16 bytes of space (0x20)
const PORTABLE_COOKIES_FILE = '_portable_cookies.json';

export interface PortableCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: string;
  expires: number; // Unix timestamp in seconds, -1 for session
}

interface PortableCookiesData {
  platform: string;
  cookies: PortableCookie[];
}

// ─────────────────────────────────────────────────────────────
// Platform-specific Chrome key retrieval
// ─────────────────────────────────────────────────────────────

/**
 * Get Chrome's encryption key for the current platform.
 * Returns null if the key cannot be obtained.
 */
function getChromeKey(userDataDir: string): { key: Buffer; isGCM: boolean } | null {
  const platform = os.platform();

  try {
    if (platform === 'linux') {
      // Linux: PBKDF2 with hardcoded password 'peanuts', 1 iteration, SHA1
      const key = crypto.pbkdf2Sync('peanuts', CHROME_SALT, 1, 16, 'sha1');
      return { key, isGCM: false };
    }

    if (platform === 'darwin') {
      // macOS: get password from Keychain, PBKDF2 with 1003 iterations
      let password = 'peanuts';
      try {
        password = execSync(
          'security find-generic-password -s "Chrome Safe Storage" -w',
          { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }
        ).trim();
      } catch {
        // Keychain access failed (no Chrome installed, permission denied, etc.)
        // Fall back to 'peanuts' which Chromium uses when Keychain is unavailable
      }
      const key = crypto.pbkdf2Sync(password, CHROME_SALT, 1003, 16, 'sha1');
      return { key, isGCM: false };
    }

    if (platform === 'win32') {
      // Windows: read encrypted key from Local State, decrypt with DPAPI
      const localStatePath = path.join(userDataDir, 'Local State');
      if (!fs.existsSync(localStatePath)) return null;

      const localState = JSON.parse(fs.readFileSync(localStatePath, 'utf-8'));
      const encryptedKeyB64 = localState?.os_crypt?.encrypted_key;
      if (!encryptedKeyB64) return null;

      const encryptedKey = Buffer.from(encryptedKeyB64, 'base64');
      // Remove 'DPAPI' prefix (5 bytes)
      const dpapiBlob = encryptedKey.slice(5);

      // Use PowerShell to decrypt via DPAPI
      const bytesStr = Array.from(dpapiBlob).join(',');
      const psScript = [
        'Add-Type -AssemblyName System.Security;',
        `$bytes = [byte[]]@(${bytesStr});`,
        '$dec = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser);',
        '[Convert]::ToBase64String($dec)',
      ].join(' ');

      const result = execSync(
        `powershell -NoProfile -NonInteractive -Command "${psScript}"`,
        { encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }
      ).trim();

      const key = Buffer.from(result, 'base64');
      return { key, isGCM: true }; // Windows uses AES-256-GCM
    }
  } catch (err) {
    console.warn('[ChromeCookieCrypto] Failed to get Chrome encryption key:', err);
  }

  return null;
}

// ─────────────────────────────────────────────────────────────
// Cookie value decryption
// ─────────────────────────────────────────────────────────────

/**
 * Decrypt a single encrypted cookie value.
 */
function decryptValue(encrypted: Buffer, key: Buffer, isGCM: boolean): string | null {
  if (!encrypted || encrypted.length === 0) return null;

  try {
    // Check for v10/v11 prefix
    const prefix = encrypted.slice(0, 3).toString('utf-8');

    if (prefix === 'v10' || prefix === 'v11') {
      const payload = encrypted.slice(3);

      if (isGCM) {
        // Windows: AES-256-GCM
        // Structure: nonce (12 bytes) + ciphertext + tag (last 16 bytes)
        if (payload.length < 12 + 16) return null;
        const nonce = payload.slice(0, 12);
        const tag = payload.slice(payload.length - 16);
        const ciphertext = payload.slice(12, payload.length - 16);

        const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf-8');
      } else {
        // Linux/macOS: AES-128-CBC
        const decipher = crypto.createDecipheriv('aes-128-cbc', key, CHROME_IV);
        return Buffer.concat([decipher.update(payload), decipher.final()]).toString('utf-8');
      }
    }

    // No recognized prefix — might be plaintext
    return encrypted.toString('utf-8');
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Convert Chrome timestamp (microseconds since Jan 1, 1601) to Unix timestamp (seconds).
 */
function chromeTimeToUnix(chromeTime: number): number {
  if (chromeTime === 0) return -1;
  return Math.floor(chromeTime / 1000000) - 11644473600;
}

/**
 * Convert Chrome samesite integer to CDP string.
 */
function sameSiteToString(sameSite: number): string {
  switch (sameSite) {
    case 0: return 'None';
    case 1: return 'Lax';
    case 2: return 'Strict';
    default: return 'Lax';
  }
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Extract cookies from a Chrome profile's Cookies database
 * and return them as a portable (decrypted) array.
 */
export function extractPortableCookies(userDataDir: string): PortableCookie[] {
  const cookiesDbPath = path.join(userDataDir, 'Default', 'Cookies');
  if (!fs.existsSync(cookiesDbPath)) return [];

  const keyInfo = getChromeKey(userDataDir);
  if (!keyInfo) {
    console.warn('[ChromeCookieCrypto] Cannot get Chrome key, skipping cookie extraction');
    return [];
  }

  const cookies: PortableCookie[] = [];
  let db: InstanceType<typeof Database> | null = null;

  try {
    db = new Database(cookiesDbPath, { readonly: true, fileMustExist: true });

    const rows = db.prepare(
      'SELECT host_key, name, value, encrypted_value, path, expires_utc, is_secure, is_httponly, samesite, has_expires FROM cookies'
    ).all() as any[];

    const now = Math.floor(Date.now() / 1000);

    for (const row of rows) {
      let cookieValue = row.value || '';

      // Try to decrypt encrypted_value
      if (row.encrypted_value && row.encrypted_value.length > 0) {
        const decrypted = decryptValue(row.encrypted_value, keyInfo.key, keyInfo.isGCM);
        if (decrypted !== null) {
          cookieValue = decrypted;
        }
      }

      if (!cookieValue) continue; // Skip cookies with empty values

      const expires = row.has_expires ? chromeTimeToUnix(row.expires_utc) : -1;

      // Skip expired cookies
      if (expires > 0 && expires < now) continue;

      cookies.push({
        name: row.name,
        value: cookieValue,
        domain: row.host_key,
        path: row.path || '/',
        secure: !!row.is_secure,
        httpOnly: !!row.is_httponly,
        sameSite: sameSiteToString(row.samesite),
        expires,
      });
    }

    console.log(`[ChromeCookieCrypto] Extracted ${cookies.length} portable cookies from ${userDataDir}`);
  } catch (err) {
    console.error('[ChromeCookieCrypto] Failed to extract cookies:', err);
  } finally {
    try { db?.close(); } catch {}
  }

  return cookies;
}

/**
 * Save portable cookies JSON file inside the profile directory.
 */
export function savePortableCookies(userDataDir: string, cookies: PortableCookie[]): void {
  if (cookies.length === 0) return;
  const filePath = path.join(userDataDir, PORTABLE_COOKIES_FILE);
  const data: PortableCookiesData = { platform: os.platform(), cookies };
  fs.writeFileSync(filePath, JSON.stringify(data), 'utf-8');
  console.log(`[ChromeCookieCrypto] Saved ${cookies.length} portable cookies to ${filePath}`);
}

/**
 * Read portable cookies from a restored profile directory, if present.
 * Returns null if no portable cookies file exists.
 */
export function readPortableCookies(userDataDir: string): PortableCookiesData | null {
  const filePath = path.join(userDataDir, PORTABLE_COOKIES_FILE);
  if (!fs.existsSync(filePath)) return null;

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as PortableCookiesData;
    console.log(`[ChromeCookieCrypto] Read ${data.cookies.length} portable cookies (source platform: ${data.platform})`);
    return data;
  } catch {
    return null;
  }
}

/**
 * Remove the portable cookies file after successful import.
 */
export function removePortableCookies(userDataDir: string): void {
  const filePath = path.join(userDataDir, PORTABLE_COOKIES_FILE);
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {}
}
