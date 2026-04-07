import * as net from 'net';
import * as http from 'http';

export class ProxyBridge {
  private server: http.Server | null = null;
  public localPort: number = 0;

  constructor(
    private remoteHost: string,
    private remotePort: number,
    private username?: string,
    private password?: string
  ) {}

  public start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        // Direct HTTP routing
        const auth = Buffer.from(`${this.username}:${this.password}`).toString('base64');
        const urlObj = new URL(req.url!);
        
        const options: http.RequestOptions = {
          hostname: this.remoteHost,
          port: this.remotePort,
          path: req.url,
          method: req.method,
          headers: {
            ...req.headers,
            'Proxy-Authorization': `Basic ${auth}`
          }
        };

        const proxyReq = http.request(options, (proxyRes) => {
          res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
          proxyRes.pipe(res, { end: true });
        });

        proxyReq.on('error', (e) => {
          if (!res.headersSent) {
            res.writeHead(502);
            res.end('Proxy Bridge Error');
          }
        });

        req.pipe(proxyReq, { end: true });
      });

      this.server.on('connect', (req, clientSocket, head) => {
        // HTTPS CONNECT routing
        const auth = Buffer.from(`${this.username}:${this.password}`).toString('base64');
        const proxySocket = net.connect(this.remotePort, this.remoteHost, () => {
          proxySocket.write(
            `CONNECT ${req.url} HTTP/1.1\r\n` +
            `Host: ${req.url}\r\n` +
            `Proxy-Authorization: Basic ${auth}\r\n` +
            `\r\n`
          );
          proxySocket.write(head);
          proxySocket.pipe(clientSocket);
          clientSocket.pipe(proxySocket);
        });

        proxySocket.on('error', () => {
          clientSocket.end();
        });

        clientSocket.on('error', () => {
          proxySocket.end();
        });
      });

      this.server.listen(0, '127.0.0.1', () => {
        this.localPort = (this.server?.address() as net.AddressInfo).port;
        resolve(this.localPort);
      });

      this.server.on('error', (err) => {
        reject(err);
      });
    });
  }

  public stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}
