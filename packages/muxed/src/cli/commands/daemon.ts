import { Command } from 'commander';
import { isDaemonRunning, cleanupStaleFiles, daemonize } from '../../daemon/process.js';
import { ensureDaemon, sendRequest } from '../client.js';
import { formatStatus, formatReload, formatJson } from '../formatter.js';
import { getSocketPath } from '../../utils/paths.js';
import net from 'node:net';

function getExplicitConfig(cmd: Command): string | undefined {
  // Walk up: daemon -> program
  return cmd.parent?.parent?.opts().config as string | undefined;
}

// ─── daemon command group ───

export const daemonCommand = new Command('daemon')
  .description('Start, stop, reload, or check status of the muxed background daemon')
  .enablePositionalOptions();

// ─── daemon start ───

daemonCommand
  .command('start')
  .description('Start the daemon process in the background')
  .option('--json', 'Output as JSON')
  .action(async (opts: { json?: boolean }) => {
    const configPath = getExplicitConfig(daemonCommand);
    const running = await isDaemonRunning();
    if (running) {
      if (opts.json) {
        console.log(formatJson({ status: 'already_running' }));
      } else {
        console.log('Daemon is already running');
      }
      return;
    }

    await cleanupStaleFiles();
    await daemonize(configPath);

    // Wait for socket to be ready
    const socketPath = getSocketPath();
    for (const delay of [100, 200, 400]) {
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
      if (connected) {
        if (opts.json) {
          console.log(formatJson({ status: 'started' }));
        } else {
          console.log('Daemon started');
        }
        return;
      }
    }

    if (opts.json) {
      console.log(formatJson({ status: 'started', warning: 'socket not yet responding' }));
    } else {
      console.log('Daemon started (socket not yet responding)');
    }
  });

// ─── daemon stop ───

daemonCommand
  .command('stop')
  .description('Stop the running daemon process')
  .action(async () => {
    try {
      await sendRequest('daemon/stop');
      console.log('Daemon stopped');
    } catch {
      console.log('Daemon is not running');
    }
  });

// ─── daemon reload ───

daemonCommand
  .command('reload')
  .description('Reload config and reconnect changed servers without restarting')
  .option('--json', 'Output as JSON')
  .action(async (opts: { json?: boolean }) => {
    const configPath = getExplicitConfig(daemonCommand);
    await ensureDaemon(configPath);
    const result = (await sendRequest('config/reload', { configPath })) as {
      added: string[];
      removed: string[];
      changed: string[];
    };
    console.log(opts.json ? formatJson(result) : formatReload(result));
  });

// ─── daemon status ───

daemonCommand
  .command('status')
  .description('Show daemon status including uptime and connected servers')
  .option('--json', 'Output as JSON')
  .action(async (opts: { json?: boolean }) => {
    const running = await isDaemonRunning();
    if (!running) {
      console.log('Daemon is not running');
      return;
    }

    const result = (await sendRequest('daemon/status')) as {
      pid: number;
      uptime: number;
      serverCount: number;
      servers: Array<Record<string, unknown>>;
    };
    console.log(
      opts.json ? formatJson(result) : formatStatus(result as Parameters<typeof formatStatus>[0])
    );
  });
