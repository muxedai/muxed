import fs from 'node:fs';
import { loadConfig } from '../core/config.js';
import { ServerPool } from '../core/server-pool.js';
import { ensureMcpdDir, getPidPath } from '../utils/paths.js';
import { createDaemonServer } from './server.js';

export async function startDaemon(configPath?: string): Promise<void> {
  const config = loadConfig(configPath);
  ensureMcpdDir();

  const serverPool = new ServerPool();
  await serverPool.connectAll(config);

  const { server, shutdown } = createDaemonServer(serverPool, config);

  // Write PID file once server is listening
  server.on('listening', () => {
    fs.writeFileSync(getPidPath(), String(process.pid));

    // Signal parent process that daemon is ready
    if (process.send) {
      process.send('ready');
    }
  });

  // Graceful shutdown on SIGTERM
  process.on('SIGTERM', () => {
    shutdown().catch(() => {
      process.exit(1);
    });
  });

  // Graceful shutdown on SIGINT
  process.on('SIGINT', () => {
    shutdown().catch(() => {
      process.exit(1);
    });
  });
}
