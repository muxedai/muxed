import { Command } from 'commander';
import { ensureDaemon, sendRequest } from '../client.js';
import { formatServers, formatJson } from '../formatter.js';
import type { ServerState } from '../../core/types.js';

export const serversCommand = new Command('servers')
  .description('List servers with connection status')
  .option('--json', 'Output as JSON')
  .action(async (opts: { json?: boolean }) => {
    const configPath = serversCommand.parent?.opts().config as string | undefined;
    await ensureDaemon(configPath);
    const result = (await sendRequest('servers/list')) as ServerState[];
    console.log(opts.json ? formatJson(result) : formatServers(result));
  });
