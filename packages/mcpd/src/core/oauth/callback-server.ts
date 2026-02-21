import http from 'node:http';

export type CallbackResult = {
  code: string;
  state?: string;
};

const SUCCESS_HTML = `<!DOCTYPE html>
<html><head><title>mcpd - Authorization Successful</title></head>
<body style="font-family:system-ui;text-align:center;padding:60px">
<h1>Authorization Successful</h1>
<p>You can close this tab and return to mcpd.</p>
</body></html>`;

const ERROR_HTML = (msg: string) => `<!DOCTYPE html>
<html><head><title>mcpd - Authorization Error</title></head>
<body style="font-family:system-ui;text-align:center;padding:60px">
<h1>Authorization Error</h1>
<p>${msg}</p>
</body></html>`;

export class CallbackServer {
  private server: http.Server | undefined;
  private _port: number | undefined;

  /**
   * Start the callback server on the specified port (0 for random).
   * Returns a promise that resolves with the authorization code and state
   * when the callback is received, or rejects on timeout/error.
   */
  start(port: number = 0, timeoutMs: number = 300_000): Promise<CallbackResult> {
    return new Promise<CallbackResult>((resolve, reject) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const cleanup = () => {
        if (timer) {
          clearTimeout(timer);
          timer = undefined;
        }
        this.close();
      };

      this.server = http.createServer((req, res) => {
        if (settled) {
          res.writeHead(400);
          res.end();
          return;
        }

        const url = new URL(req.url ?? '/', `http://127.0.0.1`);
        if (url.pathname !== '/oauth/callback') {
          res.writeHead(404);
          res.end('Not found');
          return;
        }

        const error = url.searchParams.get('error');
        if (error) {
          const desc = url.searchParams.get('error_description') ?? error;
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(ERROR_HTML(desc));
          settled = true;
          cleanup();
          reject(new Error(`OAuth error: ${desc}`));
          return;
        }

        const code = url.searchParams.get('code');
        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(ERROR_HTML('Missing authorization code'));
          settled = true;
          cleanup();
          reject(new Error('Missing authorization code in callback'));
          return;
        }

        const state = url.searchParams.get('state') ?? undefined;

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(SUCCESS_HTML);
        settled = true;
        cleanup();
        resolve({ code, state });
      });

      this.server.listen(port, '127.0.0.1', () => {
        const addr = this.server!.address();
        if (addr && typeof addr === 'object') {
          this._port = addr.port;
        }
      });

      this.server.on('error', (err) => {
        if (!settled) {
          settled = true;
          cleanup();
          reject(err);
        }
      });

      timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          cleanup();
          reject(new Error('OAuth callback timed out'));
        }
      }, timeoutMs);
    });
  }

  get port(): number | undefined {
    return this._port;
  }

  /**
   * Wait until the server is listening and return the actual port.
   */
  async waitForPort(): Promise<number> {
    if (this._port !== undefined) return this._port;

    return new Promise((resolve, reject) => {
      if (!this.server) {
        reject(new Error('Callback server not started'));
        return;
      }
      this.server.once('listening', () => {
        const addr = this.server!.address();
        if (addr && typeof addr === 'object') {
          this._port = addr.port;
          resolve(this._port);
        } else {
          reject(new Error('Could not determine callback server port'));
        }
      });
    });
  }

  close(): void {
    if (this.server) {
      this.server.close();
      this.server = undefined;
    }
  }
}
