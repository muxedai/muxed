import net from 'node:net';
import type { ServerPool } from '../core/server-pool.js';
import type { TooldConfig } from '../core/types.js';
import { loadConfig } from '../core/config.js';
import { getSocketPath } from '../utils/paths.js';
import { getLogger } from '../utils/logger.js';
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

type JsonRpcHandler = (request: JsonRpcRequest, clientTimeout?: number) => Promise<JsonRpcResponse>;

export type DaemonServer = {
  server: net.Server;
  resetIdleTimer: () => void;
  shutdown: () => Promise<void>;
  handleRequest: JsonRpcHandler;
};

export function createDaemonServer(serverPool: ServerPool, config: TooldConfig): DaemonServer {
  const socketPath = getSocketPath();
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let shutdownInProgress = false;
  const activeSockets = new Set<net.Socket>();
  let inFlightRequests = 0;

  const idleTimeout = config.daemon?.idleTimeout ?? 300_000;
  const requestTimeout = config.daemon?.requestTimeout ?? 60_000;
  const maxTotalTimeout = config.daemon?.maxTotalTimeout ?? 300_000;
  const shutdownTimeout = config.daemon?.shutdownTimeout ?? 10_000;
  const startTime = Date.now();
  const logger = getLogger();

  function resetIdleTimer(): void {
    if (idleTimer) clearTimeout(idleTimer);
    if (idleTimeout > 0) {
      idleTimer = setTimeout(() => {
        logger.info('Idle timeout reached, shutting down');
        shutdown().catch(() => {});
      }, idleTimeout);
    }
  }

  async function handleRequest(
    request: JsonRpcRequest,
    clientTimeout?: number
  ): Promise<JsonRpcResponse> {
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
        const p = params as
          | { name?: string; arguments?: Record<string, unknown>; timeout?: number }
          | undefined;
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

        const timeout = clientTimeout ?? p.timeout ?? requestTimeout;
        const result = await found.manager.callTool(found.tool.name, p.arguments ?? {}, timeout);
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

      case 'auth/status': {
        const server = (params as { server?: string } | undefined)?.server;
        const results: Array<{ server: string; auth: { type: string; hasTokens: boolean } }> = [];

        if (server) {
          const manager = serverPool.getServer(server);
          if (!manager) {
            return {
              jsonrpc: '2.0',
              id,
              error: { code: -32602, message: `Server not found: ${server}` },
            };
          }
          const authStatus = manager.getAuthStatus();
          if (authStatus) {
            results.push({ server, auth: authStatus });
          }
        } else {
          for (const state of serverPool.listServers()) {
            const manager = serverPool.getServer(state.name);
            if (manager) {
              const authStatus = manager.getAuthStatus();
              if (authStatus) {
                results.push({ server: state.name, auth: authStatus });
              }
            }
          }
        }

        return { jsonrpc: '2.0', id, result: results };
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

      case 'tools/grep': {
        const p = params as { pattern?: string } | undefined;
        if (!p?.pattern) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: 'Missing required parameter: pattern' },
          };
        }
        try {
          return { jsonrpc: '2.0', id, result: serverPool.grepTools(p.pattern) };
        } catch (err) {
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32602,
              message: err instanceof Error ? err.message : 'Invalid pattern',
            },
          };
        }
      }

      case 'resources/list': {
        const server = (params as { server?: string } | undefined)?.server;
        return { jsonrpc: '2.0', id, result: serverPool.listAllResources(server) };
      }

      case 'resources/read': {
        const p = params as { server?: string; uri?: string } | undefined;
        if (!p?.server || !p?.uri) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: 'Missing required parameters: server, uri' },
          };
        }
        const contents = await serverPool.readResource(p.server, p.uri);
        return { jsonrpc: '2.0', id, result: contents };
      }

      case 'prompts/list': {
        const server = (params as { server?: string } | undefined)?.server;
        return { jsonrpc: '2.0', id, result: serverPool.listAllPrompts(server) };
      }

      case 'prompts/get': {
        const p = params as
          | {
              server?: string;
              name?: string;
              arguments?: Record<string, string>;
            }
          | undefined;
        if (!p?.server || !p?.name) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: 'Missing required parameters: server, name' },
          };
        }
        const promptResult = await serverPool.getPrompt(p.server, p.name, p.arguments);
        return { jsonrpc: '2.0', id, result: promptResult };
      }

      case 'completions/complete': {
        const p = params as
          | {
              server?: string;
              ref?: { type: string; name: string; uri?: string };
              argument?: { name: string; value: string };
            }
          | undefined;
        if (!p?.server || !p?.ref || !p?.argument) {
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32602,
              message: 'Missing required parameters: server, ref, argument',
            },
          };
        }
        const completionResult = await serverPool.complete(p.server, p.ref, p.argument);
        return { jsonrpc: '2.0', id, result: completionResult };
      }

      case 'tasks/list': {
        const server = (params as { server?: string } | undefined)?.server;
        const tasksResult = await serverPool.listAllTasks(server);
        return { jsonrpc: '2.0', id, result: tasksResult };
      }

      case 'tasks/get': {
        const p = params as { server?: string; taskId?: string } | undefined;
        if (!p?.server || !p?.taskId) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: 'Missing required parameters: server, taskId' },
          };
        }
        const taskStatus = await serverPool.getTask(p.server, p.taskId);
        return { jsonrpc: '2.0', id, result: taskStatus };
      }

      case 'tasks/result': {
        const p = params as { server?: string; taskId?: string } | undefined;
        if (!p?.server || !p?.taskId) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: 'Missing required parameters: server, taskId' },
          };
        }
        const taskResultData = await serverPool.getTaskResult(p.server, p.taskId);
        return { jsonrpc: '2.0', id, result: taskResultData };
      }

      case 'tasks/cancel': {
        const p = params as { server?: string; taskId?: string } | undefined;
        if (!p?.server || !p?.taskId) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: 'Missing required parameters: server, taskId' },
          };
        }
        const cancelResult = await serverPool.cancelTask(p.server, p.taskId);
        return { jsonrpc: '2.0', id, result: cancelResult };
      }

      case 'tools/call-async': {
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

        const taskHandle = await found.manager.callToolWithTask(found.tool.name, p.arguments ?? {});
        // Track the task for cleanup
        serverPool.trackTask(taskHandle.taskId, found.manager.name);
        return { jsonrpc: '2.0', id, result: { ...taskHandle, server: found.manager.name } };
      }

      case 'config/reload': {
        const p = params as { configPath?: string } | undefined;
        const newConfig = loadConfig(p?.configPath);
        const changes = await serverPool.reload(newConfig);
        logger.info(
          `Config reloaded: added=${changes.added.length}, removed=${changes.removed.length}, changed=${changes.changed.length}`
        );
        return { jsonrpc: '2.0', id, result: changes };
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
    if (shutdownInProgress) {
      socket.destroy();
      return;
    }

    activeSockets.add(socket);
    let buffer = '';

    socket.on('close', () => {
      activeSockets.delete(socket);
    });

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

        inFlightRequests++;
        const clientTimeout = (request.params as { timeout?: number } | undefined)?.timeout;

        handleRequest(request, clientTimeout)
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
          })
          .finally(() => {
            inFlightRequests--;
          });
      }
    });

    socket.on('error', () => {
      activeSockets.delete(socket);
    });
  });

  async function shutdown(): Promise<void> {
    if (shutdownInProgress) return;
    shutdownInProgress = true;

    logger.info('Shutting down daemon...');

    if (idleTimer) clearTimeout(idleTimer);

    // Stop accepting new connections
    server.close();

    // Wait for in-flight requests to complete (with timeout)
    if (inFlightRequests > 0) {
      logger.info(`Waiting for ${inFlightRequests} in-flight requests to complete...`);
      await Promise.race([
        new Promise<void>((resolve) => {
          const check = setInterval(() => {
            if (inFlightRequests <= 0) {
              clearInterval(check);
              resolve();
            }
          }, 100);
        }),
        new Promise<void>((resolve) => setTimeout(resolve, shutdownTimeout)),
      ]);

      if (inFlightRequests > 0) {
        logger.warn(`Forcing shutdown with ${inFlightRequests} requests still in flight`);
      }
    }

    // Close all active sockets
    for (const socket of activeSockets) {
      socket.destroy();
    }
    activeSockets.clear();

    // Disconnect all MCP servers
    await serverPool.disconnectAll();
    logger.info('All servers disconnected');

    // Clean up files
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

    logger.info('Daemon shutdown complete');
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

  return { server, resetIdleTimer, shutdown, handleRequest };
}
