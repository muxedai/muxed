import { Command } from 'commander';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ensureDaemon, sendRequest } from '../client.js';
import { formatToolInfo, formatJson } from '../formatter.js';

export const infoCommand = new Command('info')
  .description('Show a tool\'s input schema — REQUIRED before calling any tool')
  .argument('<server/tool>', 'server_name/tool_name (e.g. postgres/query)')
  .option('--json', 'Output as JSON (machine-readable)')
  .option('--path <path>', 'Show only a subtree of the schema (e.g. "filters.tags")')
  .option('--depth <n>', 'Collapse schema deeper than N levels', parseInt)
  .addHelpText(
    'after',
    `
Examples:
  muxed info postgres/query               Full schema for the "query" tool
  muxed info github/create_issue --depth 2 Schema collapsed at depth 2
  muxed info slack/search --path "filters" Only the "filters" subtree`
  )
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
