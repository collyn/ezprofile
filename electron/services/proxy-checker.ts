import * as http from 'http';
import * as https from 'https';
import * as net from 'net';

export interface ProxyCheckResult {
  success: boolean;
  ip?: string;
  country?: string;
  countryCode?: string;
  countryName?: string;
  latency?: number;
  error?: string;
}

export interface GeoIPResult {
  countryCode: string;
  countryName: string;
}

export class ProxyChecker {
  async check(
    type: string,
    host: string,
    port: number,
    user?: string,
    pass?: string
  ): Promise<ProxyCheckResult> {
    const startTime = Date.now();

    try {
      // Simple TCP connectivity check
      await this.tcpConnect(host, port, 5000);
      const latency = Date.now() - startTime;

      // Try to get external IP through the proxy
      let ip = host;
      const requiresAuthValidation = !!(user || pass) && (type === 'http' || type === 'https');
      try {
        ip = await this.getExternalIP(type, host, port, 10000, user, pass);
      } catch (err) {
        // For authenticated HTTP proxies, a failed proxied request usually means
        // invalid credentials or a proxy that Chrome also cannot use.
        if (requiresAuthValidation) {
          throw err;
        }

        // For unauthenticated proxies, keep the old lenient behavior and only
        // use the external IP lookup as a best-effort enhancement.
      }

      // Try to look up country for the IP
      let countryCode: string | undefined;
      let countryName: string | undefined;
      try {
        const geo = await this.lookupCountry(ip);
        if (geo) {
          countryCode = geo.countryCode;
          countryName = geo.countryName;
        }
      } catch {
        // Country lookup is best-effort
      }

      return {
        success: true,
        ip,
        countryCode,
        countryName,
        latency,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Connection failed',
        latency: Date.now() - startTime,
      };
    }
  }

  /**
   * Look up country from an IP address using ip-api.com (free, no key needed, 45 req/min).
   */
  async lookupCountry(ip: string): Promise<GeoIPResult | null> {
    return new Promise((resolve) => {
      const req = http.get(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode`, {
        timeout: 5000,
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.status === 'success' && json.countryCode) {
              resolve({ countryCode: json.countryCode, countryName: json.country });
            } else {
              resolve(null);
            }
          } catch {
            resolve(null);
          }
        });
      });

      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.on('error', () => resolve(null));
    });
  }

  private tcpConnect(host: string, port: number, timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      socket.setTimeout(timeout);

      socket.connect(port, host, () => {
        socket.destroy();
        resolve();
      });

      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('Connection timeout'));
      });

      socket.on('error', (err) => {
        socket.destroy();
        reject(err);
      });
    });
  }

  private getExternalIP(
    type: string,
    host: string,
    port: number,
    timeout: number,
    user?: string,
    pass?: string
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      // For HTTP proxy, we can use CONNECT or direct request
      if (type === 'http' || type === 'https') {
        const headers: Record<string, string> = {};
        if (user || pass) {
          const auth = Buffer.from(`${user || ''}:${pass || ''}`).toString('base64');
          headers['Proxy-Authorization'] = `Basic ${auth}`;
        }

        const proxyOptions = {
          hostname: host,
          port,
          path: 'http://api.ipify.org/',
          method: 'GET',
          timeout,
          headers,
        };

        const req = http.request(proxyOptions, (res) => {
          if (res.statusCode === 407) {
            res.resume();
            reject(new Error('Proxy authentication failed'));
            return;
          }

          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            res.resume();
            reject(new Error(`Proxy returned HTTP ${res.statusCode || 'unknown'}`));
            return;
          }

          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            const ip = data.trim();
            if (!ip) {
              reject(new Error('Proxy did not return an external IP'));
              return;
            }
            resolve(ip);
          });
        });

        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Timeout'));
        });
        req.on('error', reject);
        req.end();
      } else {
        // For SOCKS, just return the host
        resolve(host);
      }
    });
  }
}
