import net from 'node:net';
import { isDaemonRunning, cleanupStaleFiles, daemonize } from '../daemon/process.js';
import { getSocketPath } from '../utils/paths.js';

export class McpdError extends Error {
  readonly code: number;
  readonly data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = 'McpdError';
    this.code = code;
    this.data = data;
  }
}

async function waitForSocket(socketPath: string, retries: number[]): Promise<void> {
  for (const delay of retries) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    const connected = await new Promise<boolean>((resolve) => {
      const sock = net.createConnection(socketPath);
      const timeout = setTimeout(() => {
        sock.destroy();
        resolve(false);
      }, 2000);
      sock.on('connect', () => {
        clearTimeout(timeout);
        sock.destroy();
        resolve(true);
      });
      sock.on('error', () => {
        clearTimeout(timeout);
        resolve(false);
      });
    });
    if (connected) return;
  }
  throw new Error('Daemon started but socket is not responding');
}

export async function ensureDaemon(configPath?: string): Promise<void> {
  const running = await isDaemonRunning();
  if (running) return;

  await cleanupStaleFiles();
  await daemonize(configPath);
  await waitForSocket(getSocketPath(), [100, 200, 400]);
}

export async function sendRequest(
  method: string,
  params?: Record<string, unknown>
): Promise<unknown> {
  const socketPath = getSocketPath();

  return new Promise<unknown>((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    let buffer = '';

    socket.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new Error('Daemon is not running. Run `mcpd status` to check.'));
      } else if ((err as NodeJS.ErrnoException).code === 'ECONNREFUSED') {
        reject(new Error('Daemon may have crashed. Try running a command to auto-restart it.'));
      } else {
        reject(err);
      }
    });

    socket.on('connect', () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method,
        ...(params ? { params } : {}),
      };
      socket.write(JSON.stringify(request) + '\n');
    });

    socket.on('data', (data) => {
      buffer += data.toString();
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex === -1) return;

      const line = buffer.slice(0, newlineIndex).trim();
      socket.destroy();

      try {
        const response = JSON.parse(line) as {
          jsonrpc: string;
          id: number | string | null;
          result?: unknown;
          error?: { code: number; message: string; data?: unknown };
        };

        if (response.error) {
          reject(new McpdError(response.error.code, response.error.message, response.error.data));
        } else {
          resolve(response.result);
        }
      } catch {
        reject(new Error('Invalid response from daemon'));
      }
    });
  });
}
