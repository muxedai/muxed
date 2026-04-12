import { Command } from 'commander';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ensureDaemon, sendRequest } from '../client.js';
import { formatToolInfo, formatJson } from '../formatter.js';

export const infoCommand = new Command('info')
  .description('Show input schema and description for a specific tool')
  .argument('<server/tool>', 'Tool identifier (e.g. myserver/mytool)')
  .option('--json', 'Output as JSON')
  .option('--path <path>', 'Extract a subtree of the input schema (e.g. "filters.tags")')
  .option('--depth <n>', 'Collapse schema at this depth', parseInt)
  .action(async (serverTool: string, opts: { json?: boolean; path?: string; depth?: number }) => {
    const configPath = infoCommand.parent?.opts().config as string | undefined;
    await ensureDaemon(configPath);
    const params: Record<string, unknown> = { name: serverTool };
    if (opts.path) params.path = opts.path;
    if (opts.depth !== undefined) params.schemaDepth = opts.depth;
    const result = (await sendRequest('tools/info', params)) as Tool;
    if (opts.json) {
      console.log(formatJson(result));
    } else {
      const slashIndex = serverTool.indexOf('/');
      const server = serverTool.slice(0, slashIndex);
      console.log(formatToolInfo(server, result));
    }
  });
