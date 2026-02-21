import { Command } from 'commander';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ensureDaemon, sendRequest } from '../client.js';
import { formatToolInfo, formatJson } from '../formatter.js';

export const infoCommand = new Command('info')
  .description('Show input schema and description for a specific tool')
  .argument('<server/tool>', 'Tool identifier (e.g. myserver/mytool)')
  .option('--json', 'Output as JSON')
  .action(async (serverTool: string, opts: { json?: boolean }) => {
    const configPath = infoCommand.parent?.opts().config as string | undefined;
    await ensureDaemon(configPath);
    const result = (await sendRequest('tools/info', { name: serverTool })) as Tool;
    if (opts.json) {
      console.log(formatJson(result));
    } else {
      const slashIndex = serverTool.indexOf('/');
      const server = serverTool.slice(0, slashIndex);
      console.log(formatToolInfo(server, result));
    }
  });
