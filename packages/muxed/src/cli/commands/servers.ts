import { Command } from 'commander';
import { ensureDaemon, sendRequest } from '../client.js';
import { formatServers, formatJson } from '../formatter.js';
import type { ServerState } from '../../core/types.js';

export const serversCommand = new Command('servers')
  .description('List connected MCP servers and their status')
  .option('--json', 'Output as JSON (machine-readable)')
  .addHelpText(
    'after',
    `
Examples:
  muxed servers              List all servers with connection state
  muxed servers --json       JSON output for scripting`
  )
  .action(async (opts: { json?: boolean }) => {
    const configPath = serversCommand.parent?.opts().config as string | undefined;
    await ensureDaemon(configPath);
    const result = (await sendRequest('servers/list')) as ServerState[];
    console.log(opts.json ? formatJson(result) : formatServers(result));
  });
