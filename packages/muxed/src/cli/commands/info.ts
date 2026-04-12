import { Command } from 'commander';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ensureDaemon, sendRequest } from '../client.js';
import { formatToolInfo, formatJson } from '../formatter.js';

export const infoCommand = new Command('info')
  .description("Show a tool's input schema — REQUIRED before calling any tool")
  .argument('<server/tool>', 'server_name/tool_name (e.g. postgres/query)')
  .option('--json', 'Output as JSON (machine-readable)')
  .option('--path <path>', 'Show only a subtree of the schema (e.g. "filters.tags")')
  .option('--depth <n>', 'Collapse schema deeper than N levels', parseInt)
  .addHelpText(
    'after',
    `
Schema exploration:
  --depth N   Show schema to N levels deep. Nodes beyond that depth are
              replaced with a summary: { _collapsed: true, _hint: "5 properties, 2 required" }.
              Scalar fields (string, number, boolean) are always shown regardless of depth.
              Start with --depth 1 for an overview, increase to explore deeper.

  --path P    Extract a subtree using dot-separated path. Navigates through:
              properties (by name), items, additionalProperties, anyOf/oneOf (by index).
              Combine with --depth to control how much of the subtree is shown.

Examples:
  muxed info postgres/query                        Full schema
  muxed info github/create_issue --depth 1         Top-level fields only, nested objects collapsed
  muxed info github/create_issue --depth 2         Two levels deep
  muxed info slack/search --path "filters"         Only the "filters" property subtree
  muxed info slack/search --path "filters.tags"    Drill into filters.tags
  muxed info api/create --path "body.items" --depth 1  Subtree with depth limit`
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
