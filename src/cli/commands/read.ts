import { Command } from 'commander';
import { ensureDaemon, sendRequest } from '../client.js';
import { formatReadResource, formatJson } from '../formatter.js';

export const readCommand = new Command('read')
  .description('Read a resource')
  .argument('<server/resource>', 'Resource identifier (e.g. myserver/myresource)')
  .argument('[uri]', 'Resource URI (optional, uses resource name as URI if not provided)')
  .option('--json', 'Output as JSON')
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
