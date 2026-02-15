import net from 'node:net';
import type { ServerPool } from '../core/server-pool.js';
import type { McpdConfig } from '../core/types.js';
import { getSocketPath } from '../utils/paths.js';
import fs from 'node:fs';

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

export type DaemonServer = {
  server: net.Server;
  resetIdleTimer: () => void;
  shutdown: () => Promise<void>;
};

export function createDaemonServer(serverPool: ServerPool, config: McpdConfig): DaemonServer {
  const socketPath = getSocketPath();
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let shutdownInProgress = false;

  const idleTimeout = config.daemon?.idleTimeout ?? 300_000;
  const requestTimeout = config.daemon?.requestTimeout ?? 60_000;
  const startTime = Date.now();

  function resetIdleTimer(): void {
    if (idleTimer) clearTimeout(idleTimer);
    if (idleTimeout > 0) {
      idleTimer = setTimeout(() => {
        shutdown().catch(() => {});
      }, idleTimeout);
    }
  }

  async function handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const { method, params, id } = request;

    switch (method) {
      case 'servers/list': {
        return { jsonrpc: '2.0', id, result: serverPool.listServers() };
      }

      case 'tools/list': {
        const server = (params as { server?: string } | undefined)?.server;
        return { jsonrpc: '2.0', id, result: serverPool.listAllTools(server) };
      }

      case 'tools/call': {
        const p = params as { name?: string; arguments?: Record<string, unknown> } | undefined;
        if (!p?.name) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: 'Missing required parameter: name' },
          };
        }

        const found = serverPool.findTool(p.name);
        if (!found) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: `Tool not found: ${p.name}` },
          };
        }

        const result = await found.manager.callTool(
          found.tool.name,
          p.arguments ?? {},
          requestTimeout
        );
        return { jsonrpc: '2.0', id, result };
      }

      case 'tools/info': {
        const p = params as { name?: string } | undefined;
        if (!p?.name) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: 'Missing required parameter: name' },
          };
        }

        const found = serverPool.findTool(p.name);
        if (!found) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: `Tool not found: ${p.name}` },
          };
        }

        return { jsonrpc: '2.0', id, result: found.tool };
      }

      case 'daemon/status': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            pid: process.pid,
            uptime: Date.now() - startTime,
            serverCount: serverPool.listServers().length,
            servers: serverPool.listServers(),
          },
        };
      }

      case 'daemon/stop': {
        // Respond before shutting down
        setImmediate(() => {
          shutdown().catch(() => {});
        });
        return { jsonrpc: '2.0', id, result: { ok: true } };
      }

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        };
    }
  }

  const server = net.createServer((socket) => {
    let buffer = '';

    socket.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      // Keep the last incomplete line in the buffer
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        resetIdleTimer();

        let request: JsonRpcRequest;
        try {
          request = JSON.parse(trimmed) as JsonRpcRequest;
        } catch {
          const errorResponse: JsonRpcResponse = {
            jsonrpc: '2.0',
            id: null,
            error: { code: -32700, message: 'Parse error' },
          };
          socket.write(JSON.stringify(errorResponse) + '\n');
          continue;
        }

        handleRequest(request)
          .then((response) => {
            if (!socket.destroyed) {
              socket.write(JSON.stringify(response) + '\n');
            }
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
            if (!socket.destroyed) {
              socket.write(JSON.stringify(errorResponse) + '\n');
            }
          });
      }
    });

    socket.on('error', () => {
      // Ignore client socket errors
    });
  });

  async function shutdown(): Promise<void> {
    if (shutdownInProgress) return;
    shutdownInProgress = true;

    if (idleTimer) clearTimeout(idleTimer);

    server.close();
    await serverPool.disconnectAll();

    try {
      fs.unlinkSync(socketPath);
    } catch {
      // Ignore if already removed
    }

    try {
      const { getPidPath } = await import('../utils/paths.js');
      fs.unlinkSync(getPidPath());
    } catch {
      // Ignore if already removed
    }

    process.exit(0);
  }

  // Remove stale socket file before listening
  try {
    fs.unlinkSync(socketPath);
  } catch {
    // Ignore if doesn't exist
  }

  server.listen(socketPath);
  resetIdleTimer();

  return { server, resetIdleTimer, shutdown };
}
