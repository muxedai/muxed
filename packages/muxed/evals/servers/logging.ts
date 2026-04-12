import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { serveHttp } from './serve-http.ts';
import { z } from 'zod/v4';

function createServer(): McpServer {
  const server = new McpServer({ name: 'logging', version: '1.0.0' }, { capabilities: {} });

  server.tool(
    'search_logs',
    'Search application logs by query, level, service, and time range',
    {
      query: z.string().optional().describe('Search query string'),
      level: z
        .enum(['debug', 'info', 'warn', 'error', 'fatal'])
        .optional()
        .describe('Log level filter'),
      service: z.string().optional().describe('Service name filter'),
      date_from: z.string().optional().describe('Start time (ISO 8601)'),
      date_to: z.string().optional().describe('End time (ISO 8601)'),
      limit: z.number().optional().describe('Max results'),
    },
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            logs: [
              {
                timestamp: '2026-03-21T08:14:55Z',
                level: 'error',
                service: 'dashboard-api',
                message: 'Failed to fetch data from upstream: connection refused',
                trace_id: 'trace-abc-123',
                metadata: { endpoint: '/api/v2/dashboard/data', status: 503 },
              },
              {
                timestamp: '2026-03-21T08:14:50Z',
                level: 'error',
                service: 'dashboard-api',
                message: 'Circuit breaker OPEN for upstream-data-service',
                trace_id: 'trace-abc-124',
                metadata: { failures: 15, threshold: 10 },
              },
              {
                timestamp: '2026-03-21T08:14:30Z',
                level: 'warn',
                service: 'dashboard-api',
                message: 'Request timeout after 30000ms',
                trace_id: 'trace-abc-125',
                metadata: { endpoint: '/api/v2/dashboard/data' },
              },
              {
                timestamp: '2026-03-21T08:10:00Z',
                level: 'error',
                service: 'upstream-data-service',
                message: 'OOM killed: container exceeded 2Gi memory limit',
                trace_id: 'trace-def-001',
                metadata: { pod: 'upstream-data-7b9f4-xk2p9' },
              },
            ],
            total: 4,
          }),
        },
      ],
    })
  );

  server.tool(
    'get_error_summary',
    'Get error counts grouped by type, service, or time period',
    {
      service: z.string().optional().describe('Service name filter'),
      date_from: z.string().optional().describe('Start time'),
      group_by: z.enum(['type', 'service', 'hour']).optional().describe('Grouping dimension'),
    },
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            summary: {
              total_errors: 487,
              period: '2026-03-21T00:00:00Z to 2026-03-21T09:00:00Z',
              by_service: [
                { service: 'dashboard-api', count: 312, change_pct: '+340%' },
                { service: 'upstream-data-service', count: 145, change_pct: '+890%' },
                { service: 'auth-service', count: 30, change_pct: '+5%' },
              ],
              by_type: [
                { type: 'connection_refused', count: 280 },
                { type: 'timeout', count: 120 },
                { type: 'oom_killed', count: 52 },
                { type: 'other', count: 35 },
              ],
            },
          }),
        },
      ],
    })
  );

  server.tool(
    'get_trace',
    'Get a distributed trace by trace ID showing the full request path',
    {
      trace_id: z.string().describe('Trace ID'),
    },
    async ({ trace_id }) => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            trace: {
              trace_id,
              duration_ms: 30500,
              status: 'error',
              spans: [
                {
                  service: 'api-gateway',
                  operation: 'GET /dashboard',
                  duration_ms: 30500,
                  status: 'error',
                },
                {
                  service: 'dashboard-api',
                  operation: 'fetchDashboardData',
                  duration_ms: 30000,
                  status: 'error',
                  error: 'upstream timeout',
                },
                {
                  service: 'upstream-data-service',
                  operation: 'queryAggregates',
                  duration_ms: 0,
                  status: 'error',
                  error: 'connection refused - container not running',
                },
              ],
            },
          }),
        },
      ],
    })
  );

  server.tool(
    'tail_logs',
    'Get the most recent log entries for a service',
    {
      service: z.string().describe('Service name'),
      lines: z.number().optional().describe('Number of lines (default 50)'),
      level: z
        .enum(['debug', 'info', 'warn', 'error', 'fatal'])
        .optional()
        .describe('Minimum log level'),
    },
    async ({ service }) => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            service,
            logs: [
              {
                timestamp: '2026-03-21T08:15:01Z',
                level: 'error',
                message: 'Failed to connect to upstream-data-service:8080',
              },
              {
                timestamp: '2026-03-21T08:15:00Z',
                level: 'info',
                message: 'Retrying connection (attempt 5/5)',
              },
              {
                timestamp: '2026-03-21T08:14:58Z',
                level: 'error',
                message: 'Failed to connect to upstream-data-service:8080',
              },
              {
                timestamp: '2026-03-21T08:14:55Z',
                level: 'warn',
                message: 'Circuit breaker tripped, requests will be rejected',
              },
            ],
          }),
        },
      ],
    })
  );

  server.tool(
    'get_service_health',
    'Get health metrics for a service including uptime, error rate, and latency',
    {
      service: z.string().describe('Service name'),
    },
    async ({ service }) => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            service,
            status: service === 'upstream-data-service' ? 'down' : 'degraded',
            uptime_pct: service === 'upstream-data-service' ? 0 : 85.2,
            error_rate_pct: service === 'upstream-data-service' ? 100 : 8.5,
            p50_latency_ms: service === 'upstream-data-service' ? null : 2500,
            p99_latency_ms: service === 'upstream-data-service' ? null : 30000,
            last_healthy: '2026-03-21T08:09:00Z',
            incidents: [
              {
                started_at: '2026-03-21T08:10:00Z',
                type: 'service_down',
                description:
                  service === 'upstream-data-service'
                    ? 'Container OOM killed, not restarting'
                    : 'Elevated error rate due to upstream dependency failure',
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
    const port = portIdx !== -1 ? parseInt(args[portIdx + 1]!, 10) : 3002;
    serveHttp(createServer, port, 'logging');
  } else {
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

main().catch((err) => {
  process.stderr.write(`logging error: ${err}\n`);
  process.exit(1);
});
