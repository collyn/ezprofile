import * as http from 'http';
import * as https from 'https';
import * as net from 'net';

export interface ProxyCheckResult {
  success: boolean;
  ip?: string;
  country?: string;
  latency?: number;
  error?: string;
}

export class ProxyChecker {
  async check(
    type: string,
    host: string,
    port: number,
    _user?: string,
    _pass?: string
  ): Promise<ProxyCheckResult> {
    const startTime = Date.now();

    try {
      // Simple TCP connectivity check
      await this.tcpConnect(host, port, 5000);
      const latency = Date.now() - startTime;

      // Try to get external IP through the proxy
      let ip = host;
      try {
        ip = await this.getExternalIP(type, host, port, 10000);
      } catch {
        // If IP check fails, still consider proxy alive
      }

      return {
        success: true,
        ip,
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

  private getExternalIP(type: string, host: string, port: number, timeout: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.ipify.org',
        port: 80,
        path: '/',
        method: 'GET',
        timeout,
        agent: false as any,
      };

      // For HTTP proxy, we can use CONNECT or direct request
      if (type === 'http' || type === 'https') {
        const proxyOptions = {
          hostname: host,
          port,
          path: 'http://api.ipify.org/',
          method: 'GET',
          timeout,
        };

        const req = http.request(proxyOptions, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve(data.trim()));
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
