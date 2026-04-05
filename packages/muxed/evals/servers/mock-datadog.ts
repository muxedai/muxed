import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { serveHttp } from './serve-http.ts';
import { z } from 'zod/v4';

// ---------------------------------------------------------------------------
// Mock data — dashboard API degradation investigation scenario
// ---------------------------------------------------------------------------

const ERROR_LOGS = [
  {
    id: 'log-001',
    timestamp: '2026-03-21T08:14:32.412Z',
    status: 'error',
    service: 'dashboard-api',
    host: 'dashboard-api-001',
    message: 'Upstream request failed: upstream-data-service returned HTTP 503',
    attributes: {
      http_status_code: 503,
      upstream_service: 'upstream-data-service',
      endpoint: '/api/v2/dashboard/overview',
      duration_ms: 30012,
      trace_id: 'abc123def456',
    },
  },
  {
    id: 'log-002',
    timestamp: '2026-03-21T08:13:58.221Z',
    status: 'error',
    service: 'dashboard-api',
    host: 'dashboard-api-001',
    message: 'Upstream request failed: upstream-data-service returned HTTP 503',
    attributes: {
      http_status_code: 503,
      upstream_service: 'upstream-data-service',
      endpoint: '/api/v2/dashboard/metrics',
      duration_ms: 30008,
      trace_id: 'abc123def789',
    },
  },
  {
    id: 'log-003',
    timestamp: '2026-03-21T08:12:45.118Z',
    status: 'error',
    service: 'dashboard-api',
    host: 'dashboard-api-002',
    message: 'Circuit breaker OPEN for upstream-data-service after 10 consecutive failures',
    attributes: {
      circuit_breaker: 'upstream-data-service',
      state: 'open',
      failure_count: 10,
      threshold: 10,
    },
  },
  {
    id: 'log-004',
    timestamp: '2026-03-21T08:10:22.901Z',
    status: 'error',
    service: 'upstream-data-service',
    host: 'upstream-data-service-001',
    message: 'OutOfMemoryError: Java heap space — failed to allocate 256MB for query result cache',
    attributes: {
      error_type: 'java.lang.OutOfMemoryError',
      heap_used_mb: 1980,
      heap_max_mb: 2048,
      gc_overhead_percent: 98,
      thread: 'query-executor-7',
    },
  },
  {
    id: 'log-005',
    timestamp: '2026-03-21T08:10:05.334Z',
    status: 'warn',
    service: 'upstream-data-service',
    host: 'upstream-data-service-001',
    message: 'GC overhead limit exceeded — 98% of time spent in garbage collection',
    attributes: {
      gc_type: 'G1 Old Generation',
      gc_duration_ms: 4200,
      heap_used_mb: 1950,
      heap_max_mb: 2048,
    },
  },
];

const MONITORS = [
  {
    id: 5001,
    name: 'Dashboard API Error Rate > 5%',
    type: 'metric alert',
    query:
      'avg(last_5m):sum:dashboard_api.errors{service:dashboard-api}.as_rate() / sum:dashboard_api.requests{service:dashboard-api}.as_rate() * 100 > 5',
    message: 'Error rate for the Dashboard API has exceeded 5%. Check upstream dependencies.',
    tags: ['service:dashboard-api', 'team:platform', 'severity:high'],
    overall_state: 'Alert',
    created: '2025-11-15T10:00:00Z',
    modified: '2026-03-21T08:12:00Z',
    options: {
      thresholds: { critical: 5, warning: 2 },
      notify_no_data: true,
      evaluation_delay: 60,
    },
    creator: { name: 'Alice Zhang', email: 'alice@example.com' },
    priority: 2,
  },
  {
    id: 5002,
    name: 'Upstream Data Service Health',
    type: 'service check',
    query: '"process.up".over("service:upstream-data-service").last(3).count_by_status()',
    message: 'Upstream Data Service is unhealthy. Memory or CPU may be saturated.',
    tags: ['service:upstream-data-service', 'team:platform', 'severity:critical'],
    overall_state: 'Alert',
    created: '2025-09-01T14:00:00Z',
    modified: '2026-03-21T08:10:00Z',
    options: {
      thresholds: { critical: 3, warning: 1, ok: 1 },
      notify_no_data: true,
    },
    creator: { name: 'Bob Martinez', email: 'bob@example.com' },
    priority: 1,
  },
];

const MONITOR_DETAILS: Record<number, object> = {
  5001: {
    ...MONITORS[0],
    state: {
      groups: {
        '*': {
          name: '*',
          status: 'Alert',
          last_triggered_ts: 1742544720,
          last_resolved_ts: 1742530000,
          last_nodata_ts: null,
        },
      },
    },
    overall_state_modified: '2026-03-21T08:12:00Z',
    matching_downtimes: [],
  },
  5002: {
    ...MONITORS[1],
    state: {
      groups: {
        'host:upstream-data-service-001': {
          name: 'host:upstream-data-service-001',
          status: 'Alert',
          last_triggered_ts: 1742544600,
          last_resolved_ts: 1742500000,
          last_nodata_ts: null,
        },
      },
    },
    overall_state_modified: '2026-03-21T08:10:00Z',
    matching_downtimes: [],
  },
};

const METRIC_SERIES = {
  status: 'ok',
  res_type: 'time_series',
  series: [
    {
      metric: 'system.mem.used',
      display_name: 'system.mem.used{service:upstream-data-service}',
      unit: [{ name: 'mebibyte', short_name: 'MiB' }],
      tag_set: ['service:upstream-data-service'],
      pointlist: [
        [1742543400000, 1024],
        [1742543700000, 1280],
        [1742544000000, 1536],
        [1742544200000, 1820],
        [1742544400000, 1950],
        [1742544600000, 2048],
        [1742544900000, 2048],
        [1742545200000, 2048],
      ],
    },
  ],
  from_date: 1742543400000,
  to_date: 1742545200000,
  query: 'avg:system.mem.used{service:upstream-data-service}',
  group_by: ['service'],
};

const HOSTS = [
  {
    name: 'upstream-data-service-001',
    id: 701,
    aliases: ['i-0abc123upstream01'],
    apps: ['java', 'upstream-data-service'],
    sources: ['datadog-agent'],
    host_name: 'upstream-data-service-001',
    up: true,
    is_muted: false,
    tags_by_source: {
      datadog: ['service:upstream-data-service', 'env:production', 'team:platform'],
    },
    metrics: {
      cpu: 95.2,
      iowait: 2.1,
      load: 12.4,
    },
    meta: {
      platform: 'linux',
      agent_version: '7.52.0',
      cpuCores: 4,
      machine: 'x86_64',
      gohai: { memory: { total: '2048MB' } },
    },
    last_reported_time: 1742545200,
  },
  {
    name: 'dashboard-api-001',
    id: 702,
    aliases: ['i-0abc123dashapi01'],
    apps: ['nodejs', 'dashboard-api'],
    sources: ['datadog-agent'],
    host_name: 'dashboard-api-001',
    up: true,
    is_muted: false,
    tags_by_source: {
      datadog: ['service:dashboard-api', 'env:production', 'team:platform'],
    },
    metrics: {
      cpu: 32.5,
      iowait: 0.4,
      load: 1.8,
    },
    meta: {
      platform: 'linux',
      agent_version: '7.52.0',
      cpuCores: 4,
      machine: 'x86_64',
      gohai: { memory: { total: '4096MB' } },
    },
    last_reported_time: 1742545200,
  },
];

const HOST_INFO: Record<string, object> = {
  'upstream-data-service-001': {
    host: HOSTS[0],
    processes: [
      {
        pid: 1234,
        name: 'java',
        command: 'java -Xmx2g -jar upstream-data-service.jar',
        cpu_percent: 94.8,
        mem_rss: 2097152,
        mem_vms: 4194304,
        state: 'running',
      },
    ],
    system: {
      cpu_cores: 4,
      cpu_usage: 95.2,
      memory_total_mb: 2048,
      memory_used_mb: 2048,
      memory_free_mb: 0,
      memory_usage_percent: 100.0,
      disk_usage_percent: 42.3,
      uptime_seconds: 864000,
    },
    network: {
      bytes_sent_per_sec: 125000,
      bytes_recv_per_sec: 890000,
      connections_established: 247,
    },
  },
  'dashboard-api-001': {
    host: HOSTS[1],
    processes: [
      {
        pid: 5678,
        name: 'node',
        command: 'node dist/server.js',
        cpu_percent: 31.2,
        mem_rss: 524288,
        mem_vms: 1048576,
        state: 'running',
      },
    ],
    system: {
      cpu_cores: 4,
      cpu_usage: 32.5,
      memory_total_mb: 4096,
      memory_used_mb: 1280,
      memory_free_mb: 2816,
      memory_usage_percent: 31.3,
      disk_usage_percent: 38.1,
      uptime_seconds: 864000,
    },
    network: {
      bytes_sent_per_sec: 450000,
      bytes_recv_per_sec: 320000,
      connections_established: 1024,
    },
  },
};

const DASHBOARDS = [
  {
    id: 'dash-abc-001',
    title: 'API Services Overview',
    description: 'Key metrics for all API services including error rates, latency, and throughput',
    url: '/dashboard/dash-abc-001/api-services-overview',
    layout_type: 'ordered',
    created_at: '2025-06-10T09:00:00Z',
    modified_at: '2026-03-15T14:30:00Z',
    author_handle: 'alice@example.com',
    is_read_only: false,
    tags: ['team:platform', 'type:service-health'],
  },
  {
    id: 'dash-abc-002',
    title: 'Infrastructure Monitoring',
    description: 'Host-level metrics: CPU, memory, disk, and network for all production hosts',
    url: '/dashboard/dash-abc-002/infrastructure-monitoring',
    layout_type: 'ordered',
    created_at: '2025-04-22T11:00:00Z',
    modified_at: '2026-03-20T16:45:00Z',
    author_handle: 'bob@example.com',
    is_read_only: false,
    tags: ['team:platform', 'type:infrastructure'],
  },
];

const DASHBOARD_DETAILS: Record<string, object> = {
  'dash-abc-001': {
    ...DASHBOARDS[0],
    widgets: [
      {
        id: 1001,
        definition: {
          type: 'timeseries',
          title: 'API Error Rate by Service',
          requests: [{ q: 'sum:api.errors{*} by {service}.as_rate()', display_type: 'line' }],
        },
      },
      {
        id: 1002,
        definition: {
          type: 'query_value',
          title: 'P99 Latency — Dashboard API',
          requests: [{ q: 'p99:api.latency{service:dashboard-api}' }],
        },
      },
      {
        id: 1003,
        definition: {
          type: 'toplist',
          title: 'Top Endpoints by Error Count',
          requests: [
            {
              q: 'top(sum:api.errors{service:dashboard-api} by {endpoint}.as_count(), 10, "sum", "desc")',
            },
          ],
        },
      },
    ],
    notify_list: ['alice@example.com', 'bob@example.com'],
  },
  'dash-abc-002': {
    ...DASHBOARDS[1],
    widgets: [
      {
        id: 2001,
        definition: {
          type: 'hostmap',
          title: 'Host CPU Usage',
          requests: [{ q: 'avg:system.cpu.user{*} by {host}' }],
        },
      },
      {
        id: 2002,
        definition: {
          type: 'timeseries',
          title: 'Memory Usage by Host',
          requests: [{ q: 'avg:system.mem.used{*} by {host}', display_type: 'area' }],
        },
      },
    ],
    notify_list: ['bob@example.com'],
  },
};

const INCIDENTS = [
  {
    id: 'inc-dd-001',
    type: 'incidents',
    attributes: {
      title: 'SEV-2: Dashboard API degradation',
      status: 'active',
      severity: 'SEV-2',
      created: '2026-03-21T08:12:00Z',
      modified: '2026-03-21T08:20:00Z',
      detected: '2026-03-21T08:10:00Z',
      customer_impact_scope: 'Dashboard pages returning errors or loading slowly for all users',
      customer_impact_start: '2026-03-21T08:10:00Z',
      customer_impact_end: null,
      customer_impacted: true,
      time_to_detect: 120,
      time_to_repair: null,
      fields: {
        root_cause: { value: 'Upstream data service OOM due to unbounded query cache' },
        services: { value: ['dashboard-api', 'upstream-data-service'] },
        teams: { value: ['Platform Engineering'] },
      },
      notification_handles: ['alice@example.com'],
    },
    relationships: {
      commander: {
        data: { type: 'users', id: 'user-001' },
      },
      created_by: {
        data: { type: 'users', id: 'user-dd-monitor' },
      },
    },
  },
];

const INCIDENT_DETAILS: Record<string, object> = {
  'inc-dd-001': {
    ...INCIDENTS[0],
    included: {
      users: [
        {
          id: 'user-001',
          type: 'users',
          attributes: {
            name: 'Alice Zhang',
            email: 'alice@example.com',
          },
        },
      ],
      attachments: [
        {
          id: 'att-001',
          type: 'incident_attachments',
          attributes: {
            attachment_type: 'link',
            attachment: {
              document_url: 'https://acme.pagerduty.com/incidents/PINC001',
              title: 'PagerDuty Incident PINC001',
            },
          },
        },
      ],
    },
    timeline: [
      {
        timestamp: '2026-03-21T08:10:00Z',
        event: 'Monitor "Upstream Data Service Health" triggered',
      },
      {
        timestamp: '2026-03-21T08:12:00Z',
        event: 'Monitor "Dashboard API Error Rate > 5%" triggered',
      },
      { timestamp: '2026-03-21T08:12:00Z', event: 'Incident created automatically' },
      { timestamp: '2026-03-21T08:15:30Z', event: 'Alice Zhang acknowledged via PagerDuty' },
      { timestamp: '2026-03-21T08:18:00Z', event: 'Alice Zhang began investigation' },
    ],
  },
};

const TIMESERIES_DATA = {
  status: 'ok',
  res_type: 'time_series',
  series: [
    {
      metric: 'api.error_rate',
      display_name: 'api.error_rate{service:dashboard-api}',
      unit: [{ name: 'percent', short_name: '%' }],
      tag_set: ['service:dashboard-api'],
      pointlist: [
        [1742543400000, 0.2],
        [1742543700000, 0.3],
        [1742544000000, 0.5],
        [1742544200000, 2.1],
        [1742544400000, 8.7],
        [1742544600000, 15.4],
        [1742544900000, 22.1],
        [1742545200000, 18.6],
      ],
    },
    {
      metric: 'api.latency.p99',
      display_name: 'api.latency.p99{service:dashboard-api}',
      unit: [{ name: 'millisecond', short_name: 'ms' }],
      tag_set: ['service:dashboard-api'],
      pointlist: [
        [1742543400000, 142],
        [1742543700000, 155],
        [1742544000000, 189],
        [1742544200000, 820],
        [1742544400000, 3200],
        [1742544600000, 4200],
        [1742544900000, 4500],
        [1742545200000, 4100],
      ],
    },
  ],
  from_date: 1742543400000,
  to_date: 1742545200000,
  query: 'avg:api.error_rate{service:dashboard-api}, avg:api.latency.p99{service:dashboard-api}',
  group_by: ['service'],
};

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

function createServer(): McpServer {
  const server = new McpServer({ name: 'datadog', version: '1.0.0' }, { capabilities: {} });

  // 1. search_logs
  server.tool(
    'search_logs',
    'Search and filter Datadog logs by query, time range, and sort order. Returns matching log entries with attributes.',
    {
      query: z.string().describe("Datadog log query, e.g. 'service:web-app status:error'"),
      from: z.string().optional().describe("Start time, ISO 8601 or relative like 'now-15m'"),
      to: z.string().optional().describe('End time'),
      sort: z.enum(['timestamp', '-timestamp']).optional().describe('Sort order by timestamp'),
      limit: z.number().optional().describe('Maximum number of log entries to return'),
      page_cursor: z.string().optional().describe('Cursor for paginating through results'),
    },
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            logs: ERROR_LOGS,
            meta: {
              page: { after: null },
              status: 'done',
              request_id: 'req-log-001',
              elapsed: 142,
            },
          }),
        },
      ],
    })
  );

  // 2. list_monitors
  server.tool(
    'list_monitors',
    'List Datadog monitors, optionally filtered by name, tags, or query string. Returns monitor definitions and current states.',
    {
      name: z.string().optional().describe('Filter by monitor name'),
      tags: z
        .array(z.string())
        .optional()
        .describe('Filter by tags attached to the monitored resource'),
      monitor_tags: z
        .array(z.string())
        .optional()
        .describe('Filter by tags attached to the monitor itself'),
      query: z.string().optional().describe('Filter monitors by query string'),
      page: z.number().optional().describe('Page number for pagination'),
      page_size: z.number().optional().describe('Number of monitors per page'),
    },
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            monitors: MONITORS,
            metadata: { total_count: MONITORS.length, page: 0, page_count: 1, per_page: 30 },
          }),
        },
      ],
    })
  );

  // 3. get_monitor
  server.tool(
    'get_monitor',
    'Get full details of a specific Datadog monitor including state history, thresholds, and notification settings.',
    {
      monitor_id: z.number().describe('The ID of the monitor to retrieve'),
      group_states: z
        .array(z.enum(['alert', 'warn', 'no_data', 'ok']))
        .optional()
        .describe('Filter returned group states'),
    },
    async ({ monitor_id }) => {
      const details = MONITOR_DETAILS[monitor_id] ?? MONITOR_DETAILS[5001];
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(details),
          },
        ],
      };
    }
  );

  // 4. query_metrics
  server.tool(
    'query_metrics',
    'Query Datadog metric timeseries data. Returns aggregated data points for the specified metric query and time range.',
    {
      query: z.string().describe("Datadog metrics query, e.g. 'avg:system.cpu.user{service:api}'"),
      from: z.string().describe('Start timestamp (Unix epoch seconds)'),
      to: z.string().describe('End timestamp'),
    },
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(METRIC_SERIES),
        },
      ],
    })
  );

  // 5. list_hosts
  server.tool(
    'list_hosts',
    'List hosts reporting to Datadog with optional filtering and sorting. Returns host metadata, tags, and key metrics.',
    {
      filter: z.string().optional().describe('Filter string for hosts'),
      sort_field: z
        .enum(['apps', 'cpu', 'iowait', 'load'])
        .optional()
        .describe('Field to sort hosts by'),
      sort_dir: z.enum(['asc', 'desc']).optional().describe('Sort direction'),
      count: z.number().optional().describe('Number of hosts to return'),
      start: z.number().optional().describe('Offset for pagination'),
    },
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            host_list: HOSTS,
            total_matching: HOSTS.length,
            total_returned: HOSTS.length,
          }),
        },
      ],
    })
  );

  // 6. get_host_info
  server.tool(
    'get_host_info',
    'Get detailed information about a specific host including processes, system metrics, and network statistics.',
    {
      hostname: z.string().describe('The hostname to look up'),
    },
    async ({ hostname }) => {
      const info = HOST_INFO[hostname] ?? HOST_INFO['upstream-data-service-001'];
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(info),
          },
        ],
      };
    }
  );

  // 7. list_dashboards
  server.tool(
    'list_dashboards',
    'List all Datadog dashboards. Returns dashboard titles, IDs, authors, and tags.',
    {
      filter_shared: z.boolean().optional().describe('If true, only return shared dashboards'),
      filter_deleted: z.boolean().optional().describe('If true, include deleted dashboards'),
    },
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            dashboards: DASHBOARDS,
            total: DASHBOARDS.length,
          }),
        },
      ],
    })
  );

  // 8. get_dashboard
  server.tool(
    'get_dashboard',
    'Get a specific Datadog dashboard by ID, including widget definitions and layout.',
    {
      dashboard_id: z.string().describe('The ID of the dashboard to retrieve'),
    },
    async ({ dashboard_id }) => {
      const details = DASHBOARD_DETAILS[dashboard_id] ?? DASHBOARD_DETAILS['dash-abc-001'];
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(details),
          },
        ],
      };
    }
  );

  // 9. list_incidents
  server.tool(
    'list_incidents',
    'List Datadog incidents with optional filtering by query, sorting, and pagination.',
    {
      query: z.string().optional().describe('Search query to filter incidents'),
      sort: z
        .enum(['created', '-created', 'modified', '-modified'])
        .optional()
        .describe('Sort order for incidents'),
      page_size: z.number().optional().describe('Number of incidents per page'),
      page_offset: z.number().optional().describe('Offset for pagination'),
    },
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            data: INCIDENTS,
            meta: {
              pagination: { offset: 0, size: 25, total: INCIDENTS.length },
            },
          }),
        },
      ],
    })
  );

  // 10. get_incident
  server.tool(
    'get_incident',
    'Get full details of a specific Datadog incident including timeline, attachments, and related users.',
    {
      incident_id: z.string().describe('The ID of the incident to retrieve'),
      include: z
        .array(z.enum(['users', 'attachments', 'postmortems']))
        .optional()
        .describe('Related resources to include in the response'),
    },
    async ({ incident_id }) => {
      const details = INCIDENT_DETAILS[incident_id] ?? INCIDENT_DETAILS['inc-dd-001'];
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ data: details }),
          },
        ],
      };
    }
  );

  // 11. query_timeseries
  server.tool(
    'query_timeseries',
    'Query Datadog for timeseries data with flexible rollup intervals. Returns metric data points over the specified time range.',
    {
      query: z.string().describe('Datadog timeseries query'),
      from: z.string().describe('Start time (ISO 8601 or Unix epoch)'),
      to: z.string().describe('End time (ISO 8601 or Unix epoch)'),
      step: z.string().optional().describe("Rollup interval, e.g. '60s', '5m'"),
    },
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(TIMESERIES_DATA),
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
    const port = portIdx !== -1 ? parseInt(args[portIdx + 1]!, 10) : 3007;
    serveHttp(createServer, port, 'datadog');
  } else {
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

main().catch((err) => {
  process.stderr.write(`datadog error: ${err}\n`);
  process.exit(1);
});
