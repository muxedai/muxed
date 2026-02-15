import { Command } from 'commander';
import { isDaemonRunning } from '../../daemon/process.js';
import { sendRequest } from '../client.js';
import { formatStatus, formatJson } from '../formatter.js';

export const statusCommand = new Command('status')
  .description('Show daemon status')
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
