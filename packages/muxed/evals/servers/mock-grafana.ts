import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { serveHttp } from './serve-http.ts';
import { z } from 'zod/v4';

function createServer(): McpServer {
  const server = new McpServer({ name: 'grafana', version: '1.0.0' }, { capabilities: {} });

  // 1. search_dashboards
  server.tool(
    'search_dashboards',
    'Search for Grafana dashboards by query, tag, or type',
    {
      query: z.string().optional().describe('Search query string'),
      tag: z.string().optional().describe('Filter by dashboard tag'),
      type: z.enum(['dash-db', 'dash-folder']).optional().describe('Type of result to return'),
      limit: z.number().optional().describe('Maximum number of results'),
      page: z.number().optional().describe('Page number for pagination'),
    },
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            dashboards: [
              {
                uid: 'api-health-001',
                title: 'Dashboard API Health',
                type: 'dash-db',
                tags: ['api', 'health', 'production'],
                url: '/d/api-health-001/dashboard-api-health',
                isStarred: true,
              },
              {
                uid: 'infra-001',
                title: 'Infrastructure Overview',
                type: 'dash-db',
                tags: ['infrastructure', 'production'],
                url: '/d/infra-001/infrastructure-overview',
                isStarred: false,
              },
              {
                uid: 'ff-impact-001',
                title: 'Feature Flags Impact',
                type: 'dash-db',
                tags: ['feature-flags', 'analytics'],
                url: '/d/ff-impact-001/feature-flags-impact',
                isStarred: false,
              },
            ],
            totalCount: 3,
            page: 1,
          }),
        },
      ],
    })
  );

  // 2. get_dashboard_by_uid
  server.tool(
    'get_dashboard_by_uid',
    'Get a full Grafana dashboard definition by its UID',
    {
      uid: z.string().describe('Dashboard UID'),
    },
    async ({ uid }) => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            dashboard: {
              uid,
              title:
                uid === 'api-health-001'
                  ? 'Dashboard API Health'
                  : uid === 'infra-001'
                    ? 'Infrastructure Overview'
                    : 'Feature Flags Impact',
              tags: ['api', 'health', 'production'],
              timezone: 'browser',
              schemaVersion: 39,
              version: 12,
              panels: [
                {
                  id: 1,
                  title: 'p99 Latency',
                  type: 'timeseries',
                  datasource: { type: 'prometheus', uid: 'prometheus-main' },
                  targets: [
                    {
                      expr: 'histogram_quantile(0.99, rate(http_request_duration_seconds_bucket{service="dashboard-api"}[5m]))',
                      legendFormat: '{{instance}}',
                    },
                  ],
                  fieldConfig: {
                    defaults: {
                      unit: 's',
                      thresholds: {
                        steps: [
                          { value: 0.5, color: 'yellow' },
                          { value: 2, color: 'red' },
                        ],
                      },
                    },
                  },
                  currentValue: 12.3,
                  normalValue: 0.2,
                  status: 'critical',
                },
                {
                  id: 2,
                  title: 'Error Rate',
                  type: 'stat',
                  datasource: { type: 'prometheus', uid: 'prometheus-main' },
                  targets: [
                    {
                      expr: 'rate(http_requests_total{service="dashboard-api",status=~"5.."}[5m]) / rate(http_requests_total{service="dashboard-api"}[5m]) * 100',
                      legendFormat: 'error_rate',
                    },
                  ],
                  fieldConfig: {
                    defaults: {
                      unit: 'percent',
                      thresholds: {
                        steps: [
                          { value: 1, color: 'yellow' },
                          { value: 5, color: 'red' },
                        ],
                      },
                    },
                  },
                  currentValue: 8.5,
                  normalValue: 0.1,
                  status: 'critical',
                },
                {
                  id: 3,
                  title: 'Upstream Health',
                  type: 'stat',
                  datasource: { type: 'prometheus', uid: 'prometheus-main' },
                  targets: [
                    {
                      expr: 'up{service="dashboard-api-upstream"}',
                      legendFormat: '{{instance}}',
                    },
                  ],
                  currentValue: 0,
                  currentLabel: 'DOWN',
                  normalValue: 1,
                  normalLabel: 'UP',
                  status: 'critical',
                },
                {
                  id: 4,
                  title: 'Active Users',
                  type: 'stat',
                  datasource: { type: 'prometheus', uid: 'prometheus-main' },
                  targets: [
                    {
                      expr: 'sum(active_users{service="dashboard-api"})',
                      legendFormat: 'active_users',
                    },
                  ],
                  currentValue: 1250,
                  normalValue: 1470,
                  percentChange: -15,
                  status: 'warning',
                },
              ],
            },
            meta: {
              slug: 'dashboard-api-health',
              created: '2026-01-10T08:00:00Z',
              updated: '2026-04-05T08:15:00Z',
              createdBy: 'admin',
              updatedBy: 'admin',
            },
          }),
        },
      ],
    })
  );

  // 3. get_dashboard_summary
  server.tool(
    'get_dashboard_summary',
    'Get a summary of a dashboard including panel titles and current status',
    {
      uid: z.string().describe('Dashboard UID'),
    },
    async ({ uid }) => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            uid,
            title:
              uid === 'api-health-001'
                ? 'Dashboard API Health'
                : uid === 'infra-001'
                  ? 'Infrastructure Overview'
                  : 'Feature Flags Impact',
            panelCount: 4,
            panels: [
              { id: 1, title: 'p99 Latency', status: 'critical', currentValue: '12.3s' },
              { id: 2, title: 'Error Rate', status: 'critical', currentValue: '8.5%' },
              { id: 3, title: 'Upstream Health', status: 'critical', currentValue: 'DOWN' },
              { id: 4, title: 'Active Users', status: 'warning', currentValue: '1250 (-15%)' },
            ],
            overallStatus: 'critical',
            lastUpdated: '2026-04-05T08:15:00Z',
          }),
        },
      ],
    })
  );

  // 4. query_prometheus
  server.tool(
    'query_prometheus',
    'Execute a PromQL query against Prometheus and return time-series results',
    {
      query: z.string().describe('PromQL expression'),
      start: z.string().optional().describe('Start time in ISO 8601 format'),
      end: z.string().optional().describe('End time in ISO 8601 format'),
      step: z.string().optional().describe('Query resolution step (e.g. 15s, 1m, 5m)'),
      legendFormat: z.string().optional().describe('Legend format template'),
    },
    async ({ query }) => {
      const isLatencyQuery = query.includes('histogram_quantile') || query.includes('duration');
      const isErrorQuery = query.includes('status=~"5') || query.includes('error');

      if (isLatencyQuery) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                status: 'success',
                data: {
                  resultType: 'matrix',
                  result: [
                    {
                      metric: { instance: 'dashboard-api-1:8080', service: 'dashboard-api' },
                      values: [
                        ['2026-04-05T07:50:00Z', '0.195'],
                        ['2026-04-05T07:55:00Z', '0.201'],
                        ['2026-04-05T08:00:00Z', '0.198'],
                        ['2026-04-05T08:05:00Z', '0.210'],
                        ['2026-04-05T08:10:00Z', '4.520'],
                        ['2026-04-05T08:15:00Z', '9.870'],
                        ['2026-04-05T08:20:00Z', '12.300'],
                        ['2026-04-05T08:25:00Z', '12.100'],
                        ['2026-04-05T08:30:00Z', '12.300'],
                      ],
                    },
                  ],
                },
              }),
            },
          ],
        };
      }

      if (isErrorQuery) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                status: 'success',
                data: {
                  resultType: 'matrix',
                  result: [
                    {
                      metric: { instance: 'dashboard-api-1:8080', service: 'dashboard-api' },
                      values: [
                        ['2026-04-05T07:50:00Z', '0.08'],
                        ['2026-04-05T07:55:00Z', '0.10'],
                        ['2026-04-05T08:00:00Z', '0.09'],
                        ['2026-04-05T08:05:00Z', '0.12'],
                        ['2026-04-05T08:10:00Z', '3.20'],
                        ['2026-04-05T08:15:00Z', '6.50'],
                        ['2026-04-05T08:20:00Z', '8.50'],
                        ['2026-04-05T08:25:00Z', '8.40'],
                        ['2026-04-05T08:30:00Z', '8.50'],
                      ],
                    },
                  ],
                },
              }),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              status: 'success',
              data: {
                resultType: 'matrix',
                result: [
                  {
                    metric: { __name__: 'up', instance: 'dashboard-api-1:8080' },
                    values: [
                      ['2026-04-05T08:00:00Z', '1'],
                      ['2026-04-05T08:10:00Z', '0'],
                      ['2026-04-05T08:20:00Z', '0'],
                      ['2026-04-05T08:30:00Z', '0'],
                    ],
                  },
                ],
              },
            }),
          },
        ],
      };
    }
  );

  // 5. query_loki_logs
  server.tool(
    'query_loki_logs',
    'Query Loki for log entries using LogQL',
    {
      query: z.string().describe('LogQL expression'),
      start: z.string().optional().describe('Start time in ISO 8601 format'),
      end: z.string().optional().describe('End time in ISO 8601 format'),
      limit: z.number().optional().describe('Maximum number of log entries to return'),
      direction: z.enum(['forward', 'backward']).optional().describe('Log ordering direction'),
    },
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            status: 'success',
            data: {
              resultType: 'streams',
              result: [
                {
                  stream: { service: 'dashboard-api', level: 'error', instance: 'dashboard-api-1' },
                  values: [
                    [
                      '2026-04-05T08:10:02Z',
                      'ERROR [dashboard-api] Connection refused to upstream service at 10.0.3.12:5432 - retrying in 5s',
                    ],
                    [
                      '2026-04-05T08:10:07Z',
                      'ERROR [dashboard-api] Connection refused to upstream service at 10.0.3.12:5432 - retrying in 10s',
                    ],
                    [
                      '2026-04-05T08:10:18Z',
                      'ERROR [dashboard-api] Circuit breaker OPEN for upstream-db after 5 consecutive failures',
                    ],
                    [
                      '2026-04-05T08:10:45Z',
                      'CRITICAL [dashboard-api] OOM detected: heap usage 1.8GB / 2GB limit - triggering GC',
                    ],
                    [
                      '2026-04-05T08:11:01Z',
                      'ERROR [dashboard-api] Connection refused to upstream service at 10.0.3.12:5432 - circuit breaker still OPEN',
                    ],
                    [
                      '2026-04-05T08:12:30Z',
                      'CRITICAL [dashboard-api] OOM killed by container runtime - restarting pod',
                    ],
                    [
                      '2026-04-05T08:13:15Z',
                      'ERROR [dashboard-api] Pod restarted - upstream still unreachable at 10.0.3.12:5432',
                    ],
                    [
                      '2026-04-05T08:15:00Z',
                      'ERROR [dashboard-api] Circuit breaker OPEN - all requests to upstream failing with connection refused',
                    ],
                  ],
                },
              ],
              stats: { ingester: { totalReached: 8, totalChunksMatched: 3 } },
            },
          }),
        },
      ],
    })
  );

  // 6. query_loki_patterns
  server.tool(
    'query_loki_patterns',
    'Detect log patterns from Loki logs to identify common error signatures',
    {
      query: z.string().describe('LogQL expression to analyze patterns for'),
      start: z.string().optional().describe('Start time in ISO 8601 format'),
      end: z.string().optional().describe('End time in ISO 8601 format'),
      limit: z.number().optional().describe('Maximum number of patterns to return'),
    },
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            patterns: [
              {
                pattern: 'Connection refused to upstream service at <ip>:<port> - <action>',
                count: 342,
                percentage: 68.4,
                sampleEntry:
                  'ERROR [dashboard-api] Connection refused to upstream service at 10.0.3.12:5432 - retrying in 5s',
              },
              {
                pattern: 'Circuit breaker <state> for upstream-db after <n> consecutive failures',
                count: 87,
                percentage: 17.4,
                sampleEntry:
                  'ERROR [dashboard-api] Circuit breaker OPEN for upstream-db after 5 consecutive failures',
              },
              {
                pattern: 'OOM <action>: heap usage <current> / <limit> limit',
                count: 71,
                percentage: 14.2,
                sampleEntry:
                  'CRITICAL [dashboard-api] OOM detected: heap usage 1.8GB / 2GB limit - triggering GC',
              },
            ],
            totalLogs: 500,
            timeRange: { start: '2026-04-05T08:10:00Z', end: '2026-04-05T08:30:00Z' },
          }),
        },
      ],
    })
  );

  // 7. list_alert_rules
  server.tool(
    'list_alert_rules',
    'List Grafana alert rules, optionally filtered by dashboard, panel, or state',
    {
      dashboard_uid: z.string().optional().describe('Filter by dashboard UID'),
      panel_id: z.number().optional().describe('Filter by panel ID'),
      state: z
        .enum(['alerting', 'pending', 'normal', 'no_data', 'error'])
        .optional()
        .describe('Filter by alert state'),
      limit: z.number().optional().describe('Maximum number of alert rules to return'),
    },
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            alerts: [
              {
                uid: 'alert-latency-001',
                title: 'Dashboard API p99 > 5s',
                state: 'alerting',
                dashboardUid: 'api-health-001',
                panelId: 1,
                condition:
                  'histogram_quantile(0.99, rate(http_request_duration_seconds_bucket{service="dashboard-api"}[5m])) > 5',
                currentValue: 12.3,
                threshold: 5,
                since: '2026-04-05T08:11:00Z',
                labels: { severity: 'critical', team: 'platform', service: 'dashboard-api' },
                annotations: {
                  summary: 'Dashboard API p99 latency is 12.3s, exceeding 5s threshold',
                  runbook: 'https://wiki.internal/runbooks/dashboard-api-latency',
                },
              },
              {
                uid: 'alert-errors-001',
                title: 'Dashboard API Error Rate > 5%',
                state: 'alerting',
                dashboardUid: 'api-health-001',
                panelId: 2,
                condition:
                  'rate(http_requests_total{service="dashboard-api",status=~"5.."}[5m]) / rate(http_requests_total{service="dashboard-api"}[5m]) * 100 > 5',
                currentValue: 8.5,
                threshold: 5,
                since: '2026-04-05T08:12:00Z',
                labels: { severity: 'critical', team: 'platform', service: 'dashboard-api' },
                annotations: {
                  summary: 'Dashboard API error rate is 8.5%, exceeding 5% threshold',
                  runbook: 'https://wiki.internal/runbooks/dashboard-api-errors',
                },
              },
              {
                uid: 'alert-uptime-001',
                title: 'Dashboard API Upstream Down',
                state: 'alerting',
                dashboardUid: 'api-health-001',
                panelId: 3,
                condition: 'up{service="dashboard-api-upstream"} == 0',
                currentValue: 0,
                threshold: 1,
                since: '2026-04-05T08:10:00Z',
                labels: { severity: 'critical', team: 'platform', service: 'dashboard-api' },
                annotations: {
                  summary: 'Dashboard API upstream service is DOWN',
                  runbook: 'https://wiki.internal/runbooks/dashboard-api-upstream',
                },
              },
            ],
            totalCount: 3,
          }),
        },
      ],
    })
  );

  // 8. get_alert_rule
  server.tool(
    'get_alert_rule',
    'Get detailed information about a specific alert rule by UID',
    {
      uid: z.string().describe('Alert rule UID'),
    },
    async ({ uid }) => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            uid,
            title:
              uid === 'alert-latency-001'
                ? 'Dashboard API p99 > 5s'
                : uid === 'alert-errors-001'
                  ? 'Dashboard API Error Rate > 5%'
                  : 'Dashboard API Upstream Down',
            state: 'alerting',
            health: 'error',
            dashboardUid: 'api-health-001',
            orgId: 1,
            folderUid: 'production-alerts',
            ruleGroup: 'dashboard-api-alerts',
            condition: 'A',
            data: [
              {
                refId: 'A',
                datasourceUid: 'prometheus-main',
                model: {
                  expr: 'histogram_quantile(0.99, rate(http_request_duration_seconds_bucket{service="dashboard-api"}[5m]))',
                },
              },
            ],
            for: '1m',
            labels: { severity: 'critical', team: 'platform', service: 'dashboard-api' },
            annotations: {
              summary: 'Dashboard API p99 latency exceeds threshold',
              runbook: 'https://wiki.internal/runbooks/dashboard-api-latency',
            },
            notificationSettings: {
              receiver: 'pagerduty-platform',
              groupBy: ['service'],
              muteTimeIntervals: [],
            },
            created: '2026-02-15T10:00:00Z',
            updated: '2026-03-20T14:30:00Z',
          }),
        },
      ],
    })
  );

  // 9. list_incidents
  server.tool(
    'list_incidents',
    'List Grafana IRM incidents, optionally filtered by status or severity',
    {
      status: z.enum(['active', 'resolved']).optional().describe('Filter by incident status'),
      severity: z
        .enum(['critical', 'major', 'minor'])
        .optional()
        .describe('Filter by severity level'),
      limit: z.number().optional().describe('Maximum number of incidents to return'),
      offset: z.number().optional().describe('Offset for pagination'),
      query: z.string().optional().describe('Search query for incidents'),
    },
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            incidents: [
              {
                id: 'inc-2026-0405-001',
                title: 'Dashboard API degradation',
                status: 'active',
                severity: 'major',
                createdAt: '2026-04-05T08:12:00Z',
                modifiedAt: '2026-04-05T08:25:00Z',
                createdBy: 'grafana-alertmanager',
                assignedTo: 'platform-oncall',
                labels: {
                  service: 'dashboard-api',
                  environment: 'production',
                  region: 'us-east-1',
                },
                summary:
                  'Dashboard API experiencing elevated latency (p99 > 12s) and high error rates (8.5%). Upstream database connection failures detected. Circuit breaker engaged.',
                relatedAlerts: ['alert-latency-001', 'alert-errors-001', 'alert-uptime-001'],
                taskCount: { total: 3, completed: 1, in_progress: 2 },
              },
            ],
            totalCount: 1,
          }),
        },
      ],
    })
  );

  // 10. create_incident
  server.tool(
    'create_incident',
    'Create a new incident in Grafana IRM',
    {
      title: z.string().describe('Incident title'),
      severity: z.enum(['critical', 'major', 'minor']).describe('Incident severity level'),
      description: z.string().optional().describe('Detailed description of the incident'),
      labels: z
        .record(z.string(), z.string())
        .optional()
        .describe('Key-value labels for the incident'),
    },
    async ({ title, severity, description, labels }) => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            id: 'inc-2026-0405-002',
            title,
            status: 'active',
            severity,
            description: description ?? '',
            labels: labels ?? {},
            createdAt: '2026-04-05T08:30:00Z',
            createdBy: 'api',
            url: 'https://grafana.internal/a/grafana-incident-app/incidents/inc-2026-0405-002',
          }),
        },
      ],
    })
  );

  // 11. get_incident
  server.tool(
    'get_incident',
    'Get detailed information about a specific incident',
    {
      id: z.string().describe('Incident ID'),
    },
    async ({ id }) => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            id,
            title: 'Dashboard API degradation',
            status: 'active',
            severity: 'major',
            createdAt: '2026-04-05T08:12:00Z',
            modifiedAt: '2026-04-05T08:25:00Z',
            createdBy: 'grafana-alertmanager',
            assignedTo: 'platform-oncall',
            labels: { service: 'dashboard-api', environment: 'production', region: 'us-east-1' },
            summary:
              'Dashboard API experiencing elevated latency (p99 > 12s) and high error rates (8.5%). Upstream database connection failures detected. Circuit breaker engaged.',
            description:
              'At 08:10 UTC, the Dashboard API upstream database became unreachable at 10.0.3.12:5432. This caused cascading failures including circuit breaker activation, OOM events due to connection retry backpressure, and pod restarts.',
            timeline: [
              { time: '2026-04-05T08:10:00Z', event: 'Upstream database connection lost' },
              { time: '2026-04-05T08:10:18Z', event: 'Circuit breaker opened for upstream-db' },
              { time: '2026-04-05T08:10:45Z', event: 'OOM detected - heap at 1.8GB/2GB' },
              { time: '2026-04-05T08:11:00Z', event: 'Alert fired: Dashboard API p99 > 5s' },
              { time: '2026-04-05T08:12:00Z', event: 'Incident auto-created by alertmanager' },
              { time: '2026-04-05T08:12:30Z', event: 'Pod OOM killed and restarted' },
              { time: '2026-04-05T08:15:00Z', event: 'On-call engineer acknowledged' },
            ],
            relatedAlerts: ['alert-latency-001', 'alert-errors-001', 'alert-uptime-001'],
            tasks: [
              {
                id: 'task-1',
                title: 'Investigate upstream DB connectivity',
                status: 'in_progress',
                assignee: 'alice@example.com',
              },
              {
                id: 'task-2',
                title: 'Increase memory limit to prevent OOM',
                status: 'completed',
                assignee: 'bob@example.com',
              },
              {
                id: 'task-3',
                title: 'Notify affected customers',
                status: 'in_progress',
                assignee: 'carol@example.com',
              },
            ],
          }),
        },
      ],
    })
  );

  // 12. list_oncall_schedules
  server.tool(
    'list_oncall_schedules',
    'List Grafana OnCall schedules',
    {
      search: z.string().optional().describe('Search query for schedule names'),
      limit: z.number().optional().describe('Maximum number of schedules to return'),
      offset: z.number().optional().describe('Offset for pagination'),
    },
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            schedules: [
              {
                id: 'schedule-platform',
                name: 'Platform Team On-Call',
                teamId: 'team-platform',
                timezone: 'America/New_York',
                currentShift: {
                  user: { id: 'user-alice', name: 'Alice Chen', email: 'alice@example.com' },
                  start: '2026-04-05T00:00:00Z',
                  end: '2026-04-06T00:00:00Z',
                },
                nextShift: {
                  user: { id: 'user-bob', name: 'Bob Martinez', email: 'bob@example.com' },
                  start: '2026-04-06T00:00:00Z',
                  end: '2026-04-07T00:00:00Z',
                },
              },
              {
                id: 'schedule-infra',
                name: 'Infrastructure On-Call',
                teamId: 'team-infra',
                timezone: 'America/New_York',
                currentShift: {
                  user: { id: 'user-dave', name: 'Dave Kim', email: 'dave@example.com' },
                  start: '2026-04-05T00:00:00Z',
                  end: '2026-04-06T00:00:00Z',
                },
                nextShift: {
                  user: { id: 'user-emma', name: 'Emma Wilson', email: 'emma@example.com' },
                  start: '2026-04-06T00:00:00Z',
                  end: '2026-04-07T00:00:00Z',
                },
              },
            ],
            totalCount: 2,
          }),
        },
      ],
    })
  );

  // 13. get_team_members
  server.tool(
    'get_team_members',
    'Get members of a Grafana team',
    {
      team_id: z.string().describe('Team ID'),
    },
    async ({ team_id }) => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            teamId: team_id,
            teamName: team_id === 'team-platform' ? 'Platform Team' : 'Infrastructure Team',
            members: [
              {
                id: 'user-alice',
                name: 'Alice Chen',
                email: 'alice@example.com',
                role: 'lead',
                status: 'active',
              },
              {
                id: 'user-bob',
                name: 'Bob Martinez',
                email: 'bob@example.com',
                role: 'senior',
                status: 'active',
              },
              {
                id: 'user-carol',
                name: 'Carol Davis',
                email: 'carol@example.com',
                role: 'member',
                status: 'active',
              },
              {
                id: 'user-frank',
                name: 'Frank Lee',
                email: 'frank@example.com',
                role: 'member',
                status: 'on_leave',
              },
            ],
            totalCount: 4,
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
    const port = portIdx !== -1 ? parseInt(args[portIdx + 1]!, 10) : 3004;
    serveHttp(createServer, port, 'grafana');
  } else {
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

main().catch((err) => {
  process.stderr.write(`grafana error: ${err}\n`);
  process.exit(1);
});
