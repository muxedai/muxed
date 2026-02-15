import { Command } from 'commander';
import type { Resource } from '@modelcontextprotocol/sdk/types.js';
import { ensureDaemon, sendRequest } from '../client.js';
import { formatResources, formatJson } from '../formatter.js';

export const resourcesCommand = new Command('resources')
  .description('List resources')
  .argument('[server]', 'Filter by server name')
  .option('--json', 'Output as JSON')
  .action(async (server: string | undefined, opts: { json?: boolean }) => {
    const configPath = resourcesCommand.parent?.opts().config as string | undefined;
    await ensureDaemon(configPath);
    const params = server ? { server } : undefined;
    const result = (await sendRequest('resources/list', params)) as Array<{
      server: string;
      resource: Resource;
    }>;
    console.log(opts.json ? formatJson(result) : formatResources(result));
  });
