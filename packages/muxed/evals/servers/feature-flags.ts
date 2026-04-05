import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { serveHttp } from './serve-http.ts';
import { z } from 'zod/v4';

function createServer(): McpServer {
  const server = new McpServer({ name: 'feature-flags', version: '1.0.0' }, { capabilities: {} });

  server.tool(
    'list_flags',
    'List all feature flags with their current state',
    {
      active_only: z.boolean().optional().describe('Only return active flags'),
    },
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            flags: [
              {
                key: 'new-dashboard-api',
                name: 'New Dashboard API',
                active: true,
                rollout_percentage: 50,
                created_at: '2026-03-15T10:00:00Z',
              },
              {
                key: 'dark-mode',
                name: 'Dark Mode',
                active: true,
                rollout_percentage: 100,
                created_at: '2026-02-01T10:00:00Z',
              },
              {
                key: 'beta-analytics',
                name: 'Beta Analytics Dashboard',
                active: false,
                rollout_percentage: 0,
                created_at: '2026-01-15T10:00:00Z',
              },
              {
                key: 'new-caching-layer',
                name: 'New Caching Layer',
                active: true,
                rollout_percentage: 25,
                created_at: '2026-03-19T14:00:00Z',
              },
            ],
          }),
        },
      ],
    })
  );

  server.tool(
    'get_flag',
    "Get a specific feature flag's configuration and rollout details",
    {
      flag_key: z.string().describe('Feature flag key'),
    },
    async ({ flag_key }) => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            flag: {
              key: flag_key,
              name: flag_key === 'new-dashboard-api' ? 'New Dashboard API' : flag_key,
              active: true,
              rollout_percentage: flag_key === 'new-dashboard-api' ? 50 : 100,
              filters: {
                groups: [
                  {
                    properties: [{ key: 'plan', value: 'enterprise', operator: 'exact' }],
                    rollout_percentage: 100,
                  },
                  { properties: [], rollout_percentage: 50 },
                ],
              },
              created_at: '2026-03-15T10:00:00Z',
              updated_at: '2026-03-20T16:30:00Z',
            },
          }),
        },
      ],
    })
  );

  server.tool(
    'evaluate_flag',
    'Evaluate a feature flag for a specific user or context',
    {
      flag_key: z.string().describe('Feature flag key'),
      user_id: z.string().optional().describe('User ID to evaluate for'),
      properties: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('Context properties for evaluation'),
    },
    async ({ flag_key, user_id }) => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            flag_key,
            user_id: user_id ?? 'anonymous',
            enabled: true,
            variant: flag_key === 'new-dashboard-api' ? 'test' : undefined,
            reason: 'matched_filter_group_0',
          }),
        },
      ],
    })
  );

  server.tool(
    'get_flag_history',
    'Get recent changes to a feature flag',
    {
      flag_key: z.string().describe('Feature flag key'),
      limit: z.number().optional().describe('Max history entries'),
    },
    async ({ flag_key }) => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            history: [
              {
                flag_key,
                changed_at: '2026-03-20T16:30:00Z',
                changed_by: 'alice@example.com',
                change_type: 'rollout_increase',
                old_value: { rollout_percentage: 10 },
                new_value: { rollout_percentage: 50 },
                comment: 'Increasing rollout after successful canary',
              },
              {
                flag_key,
                changed_at: '2026-03-19T09:00:00Z',
                changed_by: 'bob@example.com',
                change_type: 'created',
                old_value: null,
                new_value: { rollout_percentage: 10 },
                comment: 'New dashboard API rollout - phased approach',
              },
            ],
          }),
        },
      ],
    })
  );

  return server;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--http')) {
    const portIdx = args.indexOf('--port');
    const port = portIdx !== -1 ? parseInt(args[portIdx + 1]!, 10) : 3001;
    serveHttp(createServer, port, 'feature-flags');
  } else {
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

main().catch((err) => {
  process.stderr.write(`feature-flags error: ${err}\n`);
  process.exit(1);
});
