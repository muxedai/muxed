import { Command } from 'commander';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ensureDaemon, sendRequest } from '../client.js';
import { formatTools, formatJson } from '../formatter.js';
import { capture } from '../../analytics.js';

export const grepCommand = new Command('grep')
  .description('Search tools by name or description (regex)')
  .argument('<pattern>', 'Regex pattern to match against tool names and descriptions')
  .option('--json', 'Output as JSON (machine-readable)')
  .option('--include <fields>', 'Include extra fields: "schema" adds input schemas')
  .option('--depth <n>', 'Collapse schemas deeper than N levels (use with --include schema)', parseInt)
  .addHelpText(
    'after',
    `
Examples:
  muxed grep "search"          Find tools related to searching
  muxed grep "file|read"       Regex: tools matching "file" or "read"
  muxed grep "query" --json    Machine-readable output for scripting`
  )
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
