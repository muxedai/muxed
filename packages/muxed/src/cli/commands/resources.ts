import { Command } from 'commander';
import type { Resource } from '@modelcontextprotocol/sdk/types.js';
import { ensureDaemon, sendRequest } from '../client.js';
import { formatResources, formatJson } from '../formatter.js';

export const resourcesCommand = new Command('resources')
  .description('List available MCP resources across all servers')
  .argument('[server]', 'Show resources from this server only')
  .option('--json', 'Output as JSON (machine-readable)')
  .addHelpText(
    'after',
    `
Examples:
  muxed resources              List all resources
  muxed resources github       List resources from the "github" server only`
  )
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
