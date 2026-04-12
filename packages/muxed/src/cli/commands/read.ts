import { Command } from 'commander';
import { ensureDaemon, sendRequest } from '../client.js';
import { formatReadResource, formatJson } from '../formatter.js';

export const readCommand = new Command('read')
  .description('Fetch and display the contents of an MCP resource')
  .argument('<server/resource>', 'server_name/resource_name (e.g. github/repos)')
  .argument('[uri]', 'Custom URI (defaults to the resource name)')
  .option('--json', 'Output as JSON (machine-readable)')
  .addHelpText(
    'after',
    `
Examples:
  muxed read github/repos                  Read using resource name as URI
  muxed read github/repos "github://repos" Read with explicit URI`
  )
  .action(async (serverResource: string, uri: string | undefined, opts: { json?: boolean }) => {
    const configPath = readCommand.parent?.opts().config as string | undefined;
    await ensureDaemon(configPath);

    const slashIndex = serverResource.indexOf('/');
    if (slashIndex === -1) {
      console.error('Invalid format. Use: server/resource');
      process.exit(1);
    }

    const server = serverResource.slice(0, slashIndex);
    const resourceUri = uri ?? serverResource.slice(slashIndex + 1);

    const result = (await sendRequest('resources/read', { server, uri: resourceUri })) as {
      contents: Array<{ text?: string; blob?: string; mimeType?: string; uri?: string }>;
    };
    console.log(opts.json ? formatJson(result) : formatReadResource(result));
  });
