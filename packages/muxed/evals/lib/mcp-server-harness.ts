import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { createConnection } from 'node:net';
import type { MockServerDef, RunningServer } from '../types.ts';

/**
 * Get a random available port by binding to port 0 and reading the assigned port.
 */
function getRandomPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
    srv.on('error', reject);
  });
}

/**
 * Wait until a TCP port is accepting connections.
 */
async function waitForPort(port: number, timeoutMs = 10_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const connected = await new Promise<boolean>((resolve) => {
      const sock = createConnection({ port, host: '127.0.0.1' }, () => {
        sock.destroy();
        resolve(true);
      });
      sock.on('error', () => {
        sock.destroy();
        resolve(false);
      });
    });
    if (connected) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Port ${port} did not become available within ${timeoutMs}ms`);
}

/**
 * Start a single mock MCP server in HTTP mode.
 */
async function startServer(def: MockServerDef): Promise<{
  server: RunningServer;
  process: ChildProcess;
}> {
  const port = def.port ?? (await getRandomPort());
  const serverArgs = [
    '--experimental-strip-types',
    def.scriptPath,
    '--http',
    '--port',
    String(port),
    ...(def.args ?? []),
  ];

  const proc = spawn('node', serverArgs, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  // Collect stderr for debugging
  let stderr = '';
  proc.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  // Wait for process to either exit (error) or become available (success)
  const exitPromise = new Promise<never>((_, reject) => {
    proc.on('exit', (code) => {
      reject(new Error(`Server ${def.name} exited with code ${code}. stderr: ${stderr}`));
    });
  });

  await Promise.race([waitForPort(port), exitPromise]);

  return {
    server: {
      name: def.name,
      port,
      process: proc,
      url: `http://127.0.0.1:${port}/mcp`,
    },
    process: proc,
  };
}

/**
 * Start multiple mock MCP servers in HTTP mode.
 * Returns the running servers and a cleanup function.
 */
export async function startMockServers(
  defs: MockServerDef[]
): Promise<{ servers: RunningServer[]; cleanup: () => Promise<void> }> {
  const results = await Promise.all(defs.map(startServer));
  const servers = results.map((r) => r.server);
  const processes = results.map((r) => r.process);

  const cleanup = async () => {
    for (const proc of processes) {
      if (!proc.killed) {
        proc.kill('SIGTERM');
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            if (!proc.killed) proc.kill('SIGKILL');
            resolve();
          }, 2000);
          proc.on('exit', () => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
    }
  };

  return { servers, cleanup };
}
