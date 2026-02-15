import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import { createHttpListener } from './http-server.js';
import { initLogger } from '../utils/logger.js';

initLogger({ level: 'error', stderr: true });

function makeHandler(response?: unknown) {
  return async (request: { id: number | string | null; method: string }) => ({
    jsonrpc: '2.0' as const,
    id: request.id,
    result: response ?? { ok: true },
  });
}

function post(
  port: number,
  body: string,
  headers?: Record<string, string>
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => (data += chunk.toString()));
        res.on('end', () => resolve({ status: res.statusCode!, body: data }));
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function get(
  port: number,
  headers?: Record<string, string>
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, method: 'GET', headers }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => (data += chunk.toString()));
      res.on('end', () => resolve({ status: res.statusCode!, body: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('createHttpListener', () => {
  let shutdown: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (shutdown) {
      await shutdown();
      shutdown = undefined;
    }
  });

  it('handles valid JSON-RPC POST request', async () => {
    const listener = createHttpListener(makeHandler({ status: 'ok' }), {
      port: 0,
      host: '127.0.0.1',
    });
    shutdown = listener.shutdown;

    const port = await new Promise<number>((resolve) => {
      listener.httpServer.on('listening', () => {
        const addr = listener.httpServer.address();
        resolve(typeof addr === 'object' && addr ? addr.port : 0);
      });
    });

    const res = await post(
      port,
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'daemon/status', params: {} })
    );
    expect(res.status).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.result).toEqual({ status: 'ok' });
    expect(parsed.id).toBe(1);
  });

  it('rejects non-POST methods', async () => {
    const listener = createHttpListener(makeHandler(), { port: 0, host: '127.0.0.1' });
    shutdown = listener.shutdown;

    const port = await new Promise<number>((resolve) => {
      listener.httpServer.on('listening', () => {
        const addr = listener.httpServer.address();
        resolve(typeof addr === 'object' && addr ? addr.port : 0);
      });
    });

    const res = await get(port);
    expect(res.status).toBe(405);
    const parsed = JSON.parse(res.body);
    expect(parsed.error.message).toBe('Method not allowed');
  });

  it('rejects requests with bad origin', async () => {
    const listener = createHttpListener(makeHandler(), { port: 0, host: '127.0.0.1' });
    shutdown = listener.shutdown;

    const port = await new Promise<number>((resolve) => {
      listener.httpServer.on('listening', () => {
        const addr = listener.httpServer.address();
        resolve(typeof addr === 'object' && addr ? addr.port : 0);
      });
    });

    const res = await post(
      port,
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'test', params: {} }),
      { Origin: 'https://evil.com' }
    );
    expect(res.status).toBe(403);
    const parsed = JSON.parse(res.body);
    expect(parsed.error.message).toBe('Forbidden origin');
  });

  it('allows requests with localhost origin', async () => {
    const listener = createHttpListener(makeHandler(), { port: 0, host: '127.0.0.1' });
    shutdown = listener.shutdown;

    const port = await new Promise<number>((resolve) => {
      listener.httpServer.on('listening', () => {
        const addr = listener.httpServer.address();
        resolve(typeof addr === 'object' && addr ? addr.port : 0);
      });
    });

    const res = await post(
      port,
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'test', params: {} }),
      { Origin: 'http://localhost:3000' }
    );
    expect(res.status).toBe(200);
  });

  it('allows requests with 127.0.0.1 origin', async () => {
    const listener = createHttpListener(makeHandler(), { port: 0, host: '127.0.0.1' });
    shutdown = listener.shutdown;

    const port = await new Promise<number>((resolve) => {
      listener.httpServer.on('listening', () => {
        const addr = listener.httpServer.address();
        resolve(typeof addr === 'object' && addr ? addr.port : 0);
      });
    });

    const res = await post(
      port,
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'test', params: {} }),
      { Origin: 'http://127.0.0.1:8080' }
    );
    expect(res.status).toBe(200);
  });

  it('handles malformed JSON body', async () => {
    const listener = createHttpListener(makeHandler(), { port: 0, host: '127.0.0.1' });
    shutdown = listener.shutdown;

    const port = await new Promise<number>((resolve) => {
      listener.httpServer.on('listening', () => {
        const addr = listener.httpServer.address();
        resolve(typeof addr === 'object' && addr ? addr.port : 0);
      });
    });

    const res = await post(port, 'not valid json{{{');
    expect(res.status).toBe(400);
    const parsed = JSON.parse(res.body);
    expect(parsed.error.message).toBe('Parse error');
  });

  it('allows requests without origin header', async () => {
    const listener = createHttpListener(makeHandler(), { port: 0, host: '127.0.0.1' });
    shutdown = listener.shutdown;

    const port = await new Promise<number>((resolve) => {
      listener.httpServer.on('listening', () => {
        const addr = listener.httpServer.address();
        resolve(typeof addr === 'object' && addr ? addr.port : 0);
      });
    });

    const res = await post(
      port,
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'test', params: {} })
    );
    expect(res.status).toBe(200);
  });
});
