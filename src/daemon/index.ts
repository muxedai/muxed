import fs from 'node:fs';
import { loadConfig } from '../core/config.js';
import { ServerPool } from '../core/server-pool.js';
import { ensureMcpdDir, getPidPath } from '../utils/paths.js';
import { initLogger } from '../utils/logger.js';
import { createDaemonServer } from './server.js';

export async function startDaemon(configPath?: string): Promise<void> {
  const config = loadConfig(configPath);
  ensureMcpdDir();

  // Initialize logger with configured level
  const isForeground = !!process.send;
  const logger = initLogger({
    level: config.daemon?.logLevel ?? 'info',
    stderr: isForeground,
  });

  logger.info('Starting daemon...');

  const serverPool = new ServerPool();
  await serverPool.connectAll(config);

  const connectedCount = serverPool.listServers().filter((s) => s.status === 'connected').length;
  const totalCount = serverPool.listServers().length;
  logger.info(`Connected ${connectedCount}/${totalCount} servers`);

  const { server, shutdown } = createDaemonServer(serverPool, config);

  // Write PID file once server is listening
  server.on('listening', () => {
    fs.writeFileSync(getPidPath(), String(process.pid));
    logger.info(`Daemon listening (PID: ${process.pid})`);

    // Signal parent process that daemon is ready
    if (process.send) {
      process.send('ready');
    }
  });

  // Graceful shutdown on SIGTERM
  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM');
    shutdown().catch(() => {
      process.exit(1);
    });
  });

  // Graceful shutdown on SIGINT
  process.on('SIGINT', () => {
    logger.info('Received SIGINT');
    shutdown().catch(() => {
      process.exit(1);
    });
  });

  // Handle uncaught errors
  process.on('uncaughtException', (err) => {
    logger.error(`Uncaught exception: ${err.message}`);
    shutdown().catch(() => {
      process.exit(1);
    });
  });

  process.on('unhandledRejection', (reason) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    logger.error(`Unhandled rejection: ${msg}`);
  });
}
