import { Command } from 'commander';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ensureDaemon, sendRequest } from '../client.js';
import { formatTools, formatJson } from '../formatter.js';
import { capture } from '../../analytics.js';

export const toolsCommand = new Command('tools')
  .description('List available tools across all servers')
  .argument('[server]', 'Show tools from this server only')
  .option('--json', 'Output as JSON (machine-readable)')
  .option('--include <fields>', 'Include extra fields: "schema" adds input schemas')
  .option(
    '--depth <n>',
    'Collapse schemas deeper than N levels (use with --include schema)',
    parseInt
  )
  .addHelpText(
    'after',
    `
Schema options:
  --include schema        Add input schemas to each tool in the output.
  --include schema --depth N  Collapse schemas beyond N levels. Nodes deeper than N
                          are replaced with { _collapsed: true, _hint: "..." }.
                          Depth is auto-selected to fit a token budget if omitted.

Examples:
  muxed tools                              List all tools (names + descriptions)
  muxed tools postgres                     List tools from the "postgres" server only
  muxed tools --include schema             List with full input schemas
  muxed tools --include schema --depth 1   List with schemas collapsed at depth 1`
  )
  .action(
    async (
      server: string | undefined,
      opts: { json?: boolean; include?: string; depth?: number }
    ) => {
      const configPath = toolsCommand.parent?.opts().config as string | undefined;
      await ensureDaemon(configPath);
      const params: Record<string, unknown> = {};
      if (server) params.server = server;
      if (opts.include === 'schema') params.includeSchema = true;
      if (opts.depth !== undefined) params.schemaDepth = opts.depth;
      const result = (await sendRequest('tools/list', params)) as Array<{
        server: string;
        tool: Tool;
      }>;
      capture('tools_listed', { filtered_by_server: !!server, tool_count: result.length });
      console.log(opts.json ? formatJson(result) : formatTools(result));
    }
  );
