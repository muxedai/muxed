import { Command } from 'commander';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ensureDaemon, sendRequest } from '../client.js';
import { formatTools, formatJson } from '../formatter.js';
import { capture } from '../../analytics.js';

export const grepCommand = new Command('grep')
  .description('Search tools by regex pattern across names, titles, and descriptions')
  .argument('<pattern>', 'Regex pattern to search')
  .option('--json', 'Output as JSON')
  .action(async (pattern: string, opts: { json?: boolean }) => {
    const configPath = grepCommand.parent?.opts().config as string | undefined;
    await ensureDaemon(configPath);
    const result = (await sendRequest('tools/grep', { pattern })) as Array<{
      server: string;
      tool: Tool;
    }>;
    capture('tools_searched', { result_count: result.length });
    console.log(opts.json ? formatJson(result) : formatTools(result));
  });
