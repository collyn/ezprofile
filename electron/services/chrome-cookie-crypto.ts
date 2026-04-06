/**
 * Portable cookies file I/O helpers.
 *
 * During backup the CookieManager extracts cookies via Chrome CDP
 * (Chrome decrypts them itself), and we save the decrypted array to
 * _portable_cookies.json inside the profile directory.
 *
 * During restore, if _portable_cookies.json exists, we delete the old
 * Cookies database and re-import via CDP so Chrome re-encrypts with
 * the target platform's key.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const PORTABLE_COOKIES_FILE = '_portable_cookies.json';

export interface PortableCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: string;
  expires?: number;
}

interface PortableCookiesData {
  platform: string;
  cookies: PortableCookie[];
}

/**
 * Save portable cookies JSON file inside the profile directory.
 */
export function savePortableCookies(userDataDir: string, cookies: PortableCookie[]): void {
  if (cookies.length === 0) return;
  const filePath = path.join(userDataDir, PORTABLE_COOKIES_FILE);
  const data: PortableCookiesData = { platform: os.platform(), cookies };
  fs.writeFileSync(filePath, JSON.stringify(data), 'utf-8');
  console.log(`[PortableCookies] Saved ${cookies.length} portable cookies to ${filePath}`);
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
    console.log(`[PortableCookies] Read ${data.cookies.length} portable cookies (source platform: ${data.platform})`);
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
