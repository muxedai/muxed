import { Command } from 'commander';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ensureDaemon, sendRequest } from '../client.js';
import { formatTools, formatJson } from '../formatter.js';
import { capture } from '../../analytics.js';

export const grepCommand = new Command('grep')
  .description('Search tools by regex pattern across names, titles, and descriptions')
  .argument('<pattern>', 'Regex pattern to search')
  .option('--json', 'Output as JSON')
  .option('--include <fields>', 'Include additional fields (e.g. "schema")')
  .option('--depth <n>', 'Schema collapse depth (requires --include schema)', parseInt)
  .action(async (pattern: string, opts: { json?: boolean; include?: string; depth?: number }) => {
    const configPath = grepCommand.parent?.opts().config as string | undefined;
    await ensureDaemon(configPath);
    const params: Record<string, unknown> = { pattern };
    if (opts.include === 'schema') params.includeSchema = true;
    if (opts.depth !== undefined) params.schemaDepth = opts.depth;
    const result = (await sendRequest('tools/grep', params)) as Array<{
      server: string;
      tool: Tool;
    }>;
    capture('tools_searched', { result_count: result.length });
    console.log(opts.json ? formatJson(result) : formatTools(result));
  });
