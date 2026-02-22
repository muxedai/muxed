import http from 'node:http';
import { getLogger } from '../utils/logger.js';

type JsonRpcRequest = {
  jsonrpc: '2.0';
  id: number | string | null;
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse = {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

type HandleRequestFn = (
  request: JsonRpcRequest,
  clientTimeout?: number
) => Promise<JsonRpcResponse>;

type HttpListenerConfig = {
  port: number;
  host: string;
};

const ALLOWED_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function isOriginAllowed(origin: string): boolean {
  return ALLOWED_ORIGIN_RE.test(origin);
}

export function createHttpListener(
  handleRequest: HandleRequestFn,
  config: HttpListenerConfig
): { httpServer: http.Server; shutdown: () => Promise<void> } {
  const logger = getLogger();

  const httpServer = http.createServer((req, res) => {
    // Origin validation
    const origin = req.headers.origin;
    if (origin && !isOriginAllowed(origin)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32600, message: 'Forbidden origin' },
        })
      );
      return;
    }

    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32600, message: 'Method not allowed' },
        })
      );
      return;
    }

    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });

    req.on('end', () => {
      let request: JsonRpcRequest;
      try {
        request = JSON.parse(body) as JsonRpcRequest;
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32700, message: 'Parse error' },
          })
        );
        return;
      }

      const clientTimeout = (request.params as { timeout?: number } | undefined)?.timeout;

      handleRequest(request, clientTimeout)
        .then((response) => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(response));
        })
        .catch((err) => {
          const errorResponse: JsonRpcResponse = {
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32603,
              message: err instanceof Error ? err.message : 'Internal error',
            },
          };
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(errorResponse));
        });
    });
  });

  httpServer.listen(config.port, config.host, () => {
    logger.info(`HTTP listener on ${config.host}:${config.port}`);
  });

  function shutdown(): Promise<void> {
    return new Promise((resolve) => {
      httpServer.close(() => resolve());
    });
  }

  return { httpServer, shutdown };
}
