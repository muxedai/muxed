import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { loadConfig } from '../core/config.js';
import { ServerPool } from '../core/server-pool.js';
import { generateTypes, type ToolEntry } from '../codegen/typegen.js';
import { ensureTooldDir, getPidPath } from '../utils/paths.js';
import { initLogger, type Logger } from '../utils/logger.js';
import { createDaemonServer } from './server.js';
import { createHttpListener } from './http-server.js';

async function runAutoTypegen(serverPool: ServerPool, logger: Logger): Promise<void> {
  try {
    const require = createRequire(path.resolve('package.json'));
    const tooldPkgDir = path.dirname(require.resolve('toold/package.json'));
    const outputPath = path.join(tooldPkgDir, 'toold.generated.d.ts');

    const tools = serverPool.listAllTools() as ToolEntry[];
    if (tools.length === 0) {
      logger.debug('No tools available, skipping typegen');
      return;
    }

    const content = await generateTypes(tools);
    fs.writeFileSync(outputPath, content, 'utf-8');
    logger.info(`Auto-generated ${tools.length} tool types → ${outputPath}`);
  } catch {
    // Not installed as a dependency or no node_modules – skip silently
    logger.debug('Skipping auto-typegen (toold not resolvable as a dependency)');
  }
}

export async function startDaemon(configPath?: string): Promise<void> {
  const config = loadConfig(configPath);
  ensureTooldDir();

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

  // Auto-generate types after all servers are connected
  await runAutoTypegen(serverPool, logger);

  const { server, shutdown, handleRequest } = createDaemonServer(serverPool, config);

  // Start HTTP listener if enabled
  let httpShutdown: (() => Promise<void>) | undefined;
  const httpConfig = config.daemon?.http;
  if (httpConfig?.enabled) {
    const { shutdown: httpStop } = createHttpListener(handleRequest, {
      port: httpConfig.port ?? 3100,
      host: httpConfig.host ?? '127.0.0.1',
    });
    httpShutdown = httpStop;
  }

  // Write PID file once server is listening
  server.on('listening', () => {
    fs.writeFileSync(getPidPath(), String(process.pid));
    logger.info(`Daemon listening (PID: ${process.pid})`);

    // Signal parent process that daemon is ready
    if (process.send) {
      process.send('ready');
    }
  });

  async function fullShutdown(): Promise<void> {
    if (httpShutdown) await httpShutdown();
    await shutdown();
  }

  // Graceful shutdown on SIGTERM
  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM');
    fullShutdown().catch(() => {
      process.exit(1);
    });
  });

  // Graceful shutdown on SIGINT
  process.on('SIGINT', () => {
    logger.info('Received SIGINT');
    fullShutdown().catch(() => {
      process.exit(1);
    });
  });

  // Handle uncaught errors
  process.on('uncaughtException', (err) => {
    logger.error(`Uncaught exception: ${err.message}`);
    fullShutdown().catch(() => {
      process.exit(1);
    });
  });

  process.on('unhandledRejection', (reason) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    logger.error(`Unhandled rejection: ${msg}`);
  });
}
