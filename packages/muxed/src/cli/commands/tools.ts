import { Command } from 'commander';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ensureDaemon, sendRequest } from '../client.js';
import { formatTools, formatJson } from '../formatter.js';
import { capture, shutdown } from '../../analytics.js';

export const toolsCommand = new Command('tools')
  .description('List all available tools, optionally filtered by server name')
  .argument('[server]', 'Filter by server name')
  .option('--json', 'Output as JSON')
  .action(async (server: string | undefined, opts: { json?: boolean }) => {
    const configPath = toolsCommand.parent?.opts().config as string | undefined;
    await ensureDaemon(configPath);
    const params = server ? { server } : undefined;
    const result = (await sendRequest('tools/list', params)) as Array<{
      server: string;
      tool: Tool;
    }>;
    capture('tools_listed', { filtered_by_server: !!server, tool_count: result.length });
    await shutdown();
    console.log(opts.json ? formatJson(result) : formatTools(result));
  });
