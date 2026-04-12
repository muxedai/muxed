import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { serveHttp } from './serve-http.ts';
import { z } from 'zod/v4';

function createServer(): McpServer {
  const server = new McpServer({ name: 'analytics', version: '1.0.0' }, { capabilities: {} });

  server.tool(
    'query_events',
    'Query analytics events by name, date range, and properties',
    {
      event_name: z.string().describe('Event name to query, e.g. "$pageview", "$exception"'),
      date_from: z.string().optional().describe('Start date (ISO 8601)'),
      date_to: z.string().optional().describe('End date (ISO 8601)'),
      properties: z.record(z.string(), z.unknown()).optional().describe('Property filters'),
      limit: z.number().optional().describe('Max results to return'),
    },
    async ({ event_name }) => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            results: [
              {
                event: event_name,
                timestamp: '2026-03-21T08:15:00Z',
                person_id: 'user-42',
                properties: {
                  $current_url: 'https://app.example.com/dashboard',
                  $browser: 'Chrome',
                  error_message: 'Failed to fetch dashboard data: 503 Service Unavailable',
                },
              },
              {
                event: event_name,
                timestamp: '2026-03-21T08:12:00Z',
                person_id: 'user-99',
                properties: {
                  $current_url: 'https://app.example.com/dashboard',
                  $browser: 'Firefox',
                  error_message: 'Failed to fetch dashboard data: 503 Service Unavailable',
                },
              },
              {
                event: event_name,
                timestamp: '2026-03-21T08:10:00Z',
                person_id: 'user-7',
                properties: {
                  $current_url: 'https://app.example.com/dashboard',
                  $browser: 'Safari',
                  error_message: 'Dashboard API timeout after 30s',
                },
              },
            ],
            count: 3,
          }),
        },
      ],
    })
  );

  server.tool(
    'get_user_sessions',
    'Get session recordings and data for a specific user',
    {
      user_id: z.string().describe('User ID or distinct ID'),
      date_from: z.string().optional().describe('Start date'),
      limit: z.number().optional().describe('Max sessions'),
    },
    async ({ user_id }) => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            sessions: [
              {
                session_id: 'sess-abc123',
                user_id,
                start_time: '2026-03-21T08:00:00Z',
                duration_ms: 45000,
                pages_visited: ['/dashboard', '/settings'],
                events: ['$pageview', '$exception', '$pageview'],
                errors: ['503 Service Unavailable on /api/dashboard/data'],
              },
            ],
          }),
        },
      ],
    })
  );

  server.tool(
    'get_funnel',
    'Analyze conversion funnel between events',
    {
      steps: z.array(z.string()).describe('Ordered list of event names'),
      date_from: z.string().optional().describe('Start date'),
      date_to: z.string().optional().describe('End date'),
    },
    async ({ steps }) => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            steps: steps.map((step, i) => ({
              event: step,
              count: Math.max(1000 - i * 300, 100),
              conversion_rate: Math.max(100 - i * 30, 10),
            })),
          }),
        },
      ],
    })
  );

  server.tool(
    'query_insights',
    'Run a saved insight by ID or name',
    {
      insight_id: z.string().optional().describe('Insight ID'),
      insight_name: z.string().optional().describe('Insight name to search for'),
    },
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            insight: {
              id: 'insight-42',
              name: 'Dashboard Error Rate',
              type: 'trends',
              data: {
                series: [
                  {
                    label: '$exception count',
                    data: [12, 15, 45, 120, 350, 410],
                    timestamps: [
                      '2026-03-16',
                      '2026-03-17',
                      '2026-03-18',
                      '2026-03-19',
                      '2026-03-20',
                      '2026-03-21',
                    ],
                  },
                ],
              },
            },
          }),
        },
      ],
    })
  );

  server.tool(
    'list_dashboards',
    'List all available dashboards with their IDs and names',
    {},
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            dashboards: [
              { id: 'dash-1', name: 'Main Dashboard', tiles: 8 },
              { id: 'dash-2', name: 'Error Tracking', tiles: 5 },
              { id: 'dash-3', name: 'Performance Metrics', tiles: 6 },
            ],
          }),
        },
      ],
    })
  );

  server.tool(
    'get_dashboard_data',
    'Get data from a specific dashboard by ID',
    {
      dashboard_id: z.string().describe('Dashboard ID'),
    },
    async ({ dashboard_id }) => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            dashboard: {
              id: dashboard_id,
              name: 'Main Dashboard',
              tiles: [
                {
                  title: 'Active Users',
                  value: 1250,
                  trend: 'down',
                  change: -15,
                },
                {
                  title: 'Error Rate',
                  value: '8.5%',
                  trend: 'up',
                  change: 340,
                },
                {
                  title: 'Avg Load Time',
                  value: '12.3s',
                  trend: 'up',
                  change: 280,
                },
              ],
            },
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
    const port = portIdx !== -1 ? parseInt(args[portIdx + 1]!, 10) : 3000;
    serveHttp(createServer, port, 'analytics');
  } else {
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

main().catch((err) => {
  process.stderr.write(`analytics error: ${err}\n`);
  process.exit(1);
});
