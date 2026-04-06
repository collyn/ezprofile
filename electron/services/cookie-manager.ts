import puppeteer from 'puppeteer-core';
import * as fs from 'fs';
import * as path from 'path';
import { Profile } from './profile-manager';
import { ChromeLauncher } from './chrome-launcher';
import { PortableCookie } from './chrome-cookie-crypto';

export class CookieManager {
  constructor(private chromeLauncher: ChromeLauncher) {}

  async exportCookies(profile: Profile, filePath: string): Promise<void> {
    const isRunning = this.chromeLauncher.isRunning(profile.id);
    if (isRunning) {
      throw new Error("Please close the profile browser before exporting cookies!");
    }

    const browser = await puppeteer.launch({
      executablePath: this.chromeLauncher.getChromePath(),
      userDataDir: profile.user_data_dir,
      headless: 'new' as any,
      ignoreDefaultArgs: ['--enable-automation', '--use-mock-keychain', '--password-store=basic'],
      args: ['--disable-extensions', '--no-sandbox', '--disable-logging', '--log-level=3']
    });

    try {
      const pages = await browser.pages();
      const page = pages.length > 0 ? pages[0] : await browser.newPage();
      
      // Navigate to a blank page and wait a moment to ensure the 
      // cookie SQLite database has fully loaded into Chrome's memory.
      await page.goto('about:blank');
      await new Promise(resolve => setTimeout(resolve, 1500));

      const client = await page.createCDPSession();
      const { cookies } = await client.send('Network.getAllCookies');
      
      fs.writeFileSync(filePath, JSON.stringify(cookies, null, 2), 'utf-8');
    } finally {
      await browser.close();
    }
  }

  async importCookies(profile: Profile, filePath: string): Promise<void> {
    const isRunning = this.chromeLauncher.isRunning(profile.id);
    if (isRunning) {
      throw new Error("Please close the profile browser before importing cookies!");
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    let cookiesData;
    try {
      cookiesData = JSON.parse(content);
    } catch {
      throw new Error("File Cookie không đúng định dạng JSON");
    }

    if (!Array.isArray(cookiesData)) {
      throw new Error("Dữ liệu Cookie phải là một mảng (Array)");
    }

    // Adapt common cookie formats to CDP format
    const cookies = cookiesData.map((c: any) => {
      // Network.setCookies expects strictly CookieParam fields.
      let sameSite = c.sameSite;
      if (sameSite === 'no_restriction' || sameSite === 'unspecified') {
        sameSite = 'None';
      } else if (sameSite && sameSite.toLowerCase() === 'lax') {
        sameSite = 'Lax';
      } else if (sameSite && sameSite.toLowerCase() === 'strict') {
        sameSite = 'Strict';
      }

      const param: any = {
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        secure: sameSite === 'None' ? true : c.secure,
        httpOnly: c.httpOnly,
        sameSite: sameSite,
      };

      // Handle expiration
      const exp = c.expires !== undefined ? c.expires : c.expirationDate;
      if (exp !== undefined && exp !== null && typeof exp === 'number') {
        param.expires = exp;
      }

      // Generate url from domain if missing (CDP strictly requires contextual URL for custom domains)
      let url = c.url;
      if (!url && c.domain) {
        let domainStr = c.domain.startsWith('.') ? c.domain.substring(1) : c.domain;
        url = `http${param.secure ? 's' : ''}://${domainStr}${c.path || '/'}`;
      }
      if (url) param.url = url;

      return param;
    });

    const browser = await puppeteer.launch({
      executablePath: this.chromeLauncher.getChromePath(),
      userDataDir: profile.user_data_dir,
      headless: 'new' as any,
      ignoreDefaultArgs: ['--enable-automation', '--use-mock-keychain', '--password-store=basic'],
      args: ['--disable-extensions', '--no-sandbox', '--disable-logging', '--log-level=3']
    });

    try {
      const pages = await browser.pages();
      const page = pages.length > 0 ? pages[0] : await browser.newPage();
      const client = await page.createCDPSession();
      
      // CDP Network.setCookies takes an array
      await client.send('Network.setCookies', { cookies });
      
      // Delay to ensure Chrome flushes the new cookies to the SQLite database
      await new Promise(resolve => setTimeout(resolve, 2000));
    } finally {
      await browser.close();
    }
  }

  /**
   * Import cookies from a PortableCookie array via CDP.
   * Used during cross-platform restore to re-encrypt cookies
   * with the target platform's Chrome key.
   */
  async importCookiesFromArray(profile: Profile, portableCookies: PortableCookie[]): Promise<void> {
    if (portableCookies.length === 0) return;

    console.log(`[CookieManager] Importing ${portableCookies.length} portable cookies for profile ${profile.id}`);

    const cookies = portableCookies.map(c => {
      const param: any = {
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        secure: c.sameSite === 'None' ? true : c.secure,
        httpOnly: c.httpOnly,
        sameSite: c.sameSite,
      };

      if (c.expires > 0) {
        param.expires = c.expires;
      }

      // Generate URL from domain (CDP requires a contextual URL)
      let domainStr = c.domain.startsWith('.') ? c.domain.substring(1) : c.domain;
      param.url = `http${param.secure ? 's' : ''}://${domainStr}${c.path || '/'}`;

      return param;
    });

    const browser = await puppeteer.launch({
      executablePath: this.chromeLauncher.getChromePath(),
      userDataDir: profile.user_data_dir,
      headless: 'new' as any,
      ignoreDefaultArgs: ['--enable-automation', '--use-mock-keychain', '--password-store=basic'],
      args: ['--disable-extensions', '--no-sandbox', '--disable-logging', '--log-level=3']
    });

    try {
      const pages = await browser.pages();
      const page = pages.length > 0 ? pages[0] : await browser.newPage();
      const client = await page.createCDPSession();

      // Inject cookies via CDP — Chrome re-encrypts them with the local platform's key
      await client.send('Network.setCookies', { cookies });

      // Wait for Chrome to flush cookies to the SQLite database
      await new Promise(resolve => setTimeout(resolve, 2000));

      console.log(`[CookieManager] Successfully imported ${cookies.length} portable cookies`);
    } finally {
      await browser.close();
    }
  }
}
