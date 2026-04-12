import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { serveHttp } from './serve-http.ts';
import { z } from 'zod/v4';

function createServer(): McpServer {
  const server = new McpServer({ name: 'sentry', version: '1.0.0' }, { capabilities: {} });

  server.tool(
    'list_projects',
    'List all projects for a Sentry organization. Returns project slugs, platforms, and summary statistics. Use this to discover available projects before querying issues or events.',
    {
      organization_slug: z.string().describe('The slug of the Sentry organization'),
      view: z.enum(['summary', 'detailed']).optional().describe('Level of detail to return'),
      format: z.enum(['plain', 'markdown']).optional().describe('Output format'),
    },
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            projects: [
              {
                slug: 'dashboard-app',
                name: 'Dashboard App',
                platform: 'javascript',
                status: 'active',
                stats: { events_24h: 1245, issues_unresolved: 23 },
              },
              {
                slug: 'api-service',
                name: 'API Service',
                platform: 'nodejs',
                status: 'active',
                stats: { events_24h: 3892, issues_unresolved: 11 },
              },
              {
                slug: 'data-pipeline',
                name: 'Data Pipeline',
                platform: 'python',
                status: 'active',
                stats: { events_24h: 567, issues_unresolved: 4 },
              },
            ],
          }),
        },
      ],
    })
  );

  server.tool(
    'get_sentry_issue',
    'Retrieve detailed information about a specific Sentry issue by its numeric ID or full URL. Returns the issue title, culprit, stack trace, event count, user impact, and assignment status.',
    {
      issue_id_or_url: z.string().describe('Full URL or numeric issue ID'),
      organization_slug: z.string().describe('The slug of the Sentry organization'),
      view: z.enum(['summary', 'detailed']).optional().describe('Level of detail to return'),
      format: z.enum(['plain', 'markdown']).optional().describe('Output format'),
    },
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            issue: {
              id: '4821903',
              shortId: 'DASH-1A7',
              title: 'DashboardApiError: Failed to fetch dashboard data',
              culprit: 'fetchData(dashboard-api/src/data-fetcher.ts)',
              type: 'error',
              status: 'unresolved',
              level: 'error',
              platform: 'javascript',
              project: { slug: 'dashboard-app', name: 'Dashboard App' },
              count: 87,
              userCount: 42,
              firstSeen: '2026-03-21T06:45:00Z',
              lastSeen: '2026-03-21T08:15:00Z',
              assignedTo: null,
              metadata: {
                type: 'DashboardApiError',
                value: 'Failed to fetch dashboard data: upstream service returned 503',
                filename: 'dashboard-api/src/data-fetcher.ts',
                function: 'fetchData',
              },
              stats: {
                '24h': [0, 0, 2, 5, 12, 28, 40],
                percentChange: 340,
              },
              latestEvent: {
                eventID: 'evt-a1b2c3d4',
                context: {
                  browser: { name: 'Chrome', version: '124.0.0' },
                  os: { name: 'macOS', version: '15.3' },
                },
                tags: {
                  service: 'dashboard-api',
                  environment: 'production',
                  release: 'v2.14.3',
                },
                exception: {
                  type: 'DashboardApiError',
                  value: 'Failed to fetch dashboard data: upstream service returned 503',
                  stacktrace: {
                    frames: [
                      {
                        filename: 'dashboard-api/src/data-fetcher.ts',
                        function: 'fetchData',
                        lineno: 47,
                        colno: 12,
                        context_line:
                          'throw new DashboardApiError(`Failed to fetch dashboard data: ${response.statusText}`);',
                      },
                      {
                        filename: 'dashboard-api/src/routes/dashboard.ts',
                        function: 'handleDashboardRequest',
                        lineno: 23,
                        colno: 18,
                        context_line: 'const data = await fetchData(params.dashboardId);',
                      },
                      {
                        filename: 'node_modules/express/lib/router/layer.js',
                        function: 'handle',
                        lineno: 95,
                        colno: 5,
                        context_line: 'fn(req, res, next);',
                      },
                    ],
                  },
                },
              },
            },
          }),
        },
      ],
    })
  );

  server.tool(
    'list_project_issues',
    'List issues for a given Sentry project with optional filtering by status, sort order, and search query. Supports pagination via cursor. Returns issue titles, event counts, and first/last seen timestamps.',
    {
      organization_slug: z.string().describe('The slug of the Sentry organization'),
      project_slug: z.string().describe('The slug of the project'),
      query: z.string().optional().describe('Search query to filter issues'),
      sort: z.enum(['date', 'new', 'freq', 'user']).optional().describe('Sort order for results'),
      status: z
        .enum(['resolved', 'unresolved', 'ignored'])
        .optional()
        .describe('Filter by issue status'),
      cursor: z.string().optional().describe('Pagination cursor for fetching next page'),
      limit: z.number().optional().describe('Maximum number of issues to return'),
    },
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            issues: [
              {
                id: '4821903',
                shortId: 'DASH-1A7',
                title: 'DashboardApiError: Failed to fetch dashboard data',
                culprit: 'fetchData(dashboard-api/src/data-fetcher.ts)',
                status: 'unresolved',
                level: 'error',
                count: 87,
                userCount: 42,
                firstSeen: '2026-03-21T06:45:00Z',
                lastSeen: '2026-03-21T08:15:00Z',
                stats: { percentChange: 340 },
              },
              {
                id: '4821887',
                shortId: 'DASH-1A6',
                title: 'TimeoutError: Request timed out after 30000ms',
                culprit: 'requestWithRetry(dashboard-api/src/http-client.ts)',
                status: 'unresolved',
                level: 'error',
                count: 34,
                userCount: 19,
                firstSeen: '2026-03-21T07:20:00Z',
                lastSeen: '2026-03-21T08:14:00Z',
                stats: { percentChange: 180 },
              },
              {
                id: '4820115',
                shortId: 'DASH-19F',
                title: 'TypeError: Cannot read properties of undefined (reading "widgets")',
                culprit: 'renderDashboard(dashboard-app/src/components/Dashboard.tsx)',
                status: 'unresolved',
                level: 'error',
                count: 12,
                userCount: 8,
                firstSeen: '2026-03-20T14:30:00Z',
                lastSeen: '2026-03-21T07:55:00Z',
                stats: { percentChange: 50 },
              },
            ],
            nextCursor: 'cursor-page2-abc',
          }),
        },
      ],
    })
  );

  server.tool(
    'list_issue_events',
    'List recent events (occurrences) for a specific Sentry issue. Each event includes a timestamp, event ID, and contextual metadata. Use this to understand the timeline and frequency of an error.',
    {
      issue_id: z.string().describe('The numeric issue ID'),
      organization_slug: z.string().describe('The slug of the Sentry organization'),
      cursor: z.string().optional().describe('Pagination cursor for fetching next page'),
      limit: z.number().optional().describe('Maximum number of events to return'),
    },
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            events: [
              {
                eventID: 'evt-a1b2c3d4',
                dateCreated: '2026-03-21T08:15:00Z',
                title: 'DashboardApiError: Failed to fetch dashboard data',
                message: 'upstream service returned 503',
                user: { id: 'user-42', email: 'alice@example.com' },
                tags: { browser: 'Chrome 124', os: 'macOS 15.3', environment: 'production' },
              },
              {
                eventID: 'evt-e5f6g7h8',
                dateCreated: '2026-03-21T08:12:00Z',
                title: 'DashboardApiError: Failed to fetch dashboard data',
                message: 'upstream service returned 503',
                user: { id: 'user-99', email: 'bob@example.com' },
                tags: { browser: 'Firefox 125', os: 'Windows 11', environment: 'production' },
              },
              {
                eventID: 'evt-i9j0k1l2',
                dateCreated: '2026-03-21T08:10:00Z',
                title: 'DashboardApiError: Failed to fetch dashboard data',
                message: 'upstream service returned 503',
                user: { id: 'user-7', email: 'carol@example.com' },
                tags: { browser: 'Safari 18', os: 'macOS 15.3', environment: 'production' },
              },
            ],
            nextCursor: null,
          }),
        },
      ],
    })
  );

  server.tool(
    'search_errors_in_file',
    'Search for Sentry error events originating from a specific source file. Useful for understanding which errors are thrown by a particular module or file in your codebase.',
    {
      organization_slug: z.string().describe('The slug of the Sentry organization'),
      project_slug: z.string().describe('The slug of the project'),
      filename: z.string().describe('Source filename to search for in stack traces'),
      event_type: z.string().optional().describe('Filter by event type (e.g. "error", "default")'),
    },
    async ({ filename }) => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            errors: [
              {
                issueId: '4821903',
                title: 'DashboardApiError: Failed to fetch dashboard data',
                culprit: `fetchData(${filename})`,
                count: 87,
                lastSeen: '2026-03-21T08:15:00Z',
                stackFrame: {
                  filename,
                  function: 'fetchData',
                  lineno: 47,
                  context_line:
                    'throw new DashboardApiError(`Failed to fetch dashboard data: ${response.statusText}`);',
                },
              },
              {
                issueId: '4821887',
                title: 'TimeoutError: Request timed out after 30000ms',
                culprit: `requestWithRetry(${filename})`,
                count: 34,
                lastSeen: '2026-03-21T08:14:00Z',
                stackFrame: {
                  filename,
                  function: 'requestWithRetry',
                  lineno: 82,
                  context_line: 'throw new TimeoutError(`Request timed out after ${timeout}ms`);',
                },
              },
            ],
          }),
        },
      ],
    })
  );

  server.tool(
    'get_sentry_event',
    'Retrieve full details for a specific Sentry event by its event ID. Includes the complete exception stack trace, breadcrumbs, tags, user context, and device information.',
    {
      organization_slug: z.string().describe('The slug of the Sentry organization'),
      project_slug: z.string().describe('The slug of the project'),
      event_id: z.string().describe('The event ID to retrieve'),
    },
    async ({ event_id }) => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            event: {
              eventID: event_id,
              dateCreated: '2026-03-21T08:15:00Z',
              title: 'DashboardApiError: Failed to fetch dashboard data',
              platform: 'javascript',
              context: {
                browser: { name: 'Chrome', version: '124.0.0' },
                os: { name: 'macOS', version: '15.3' },
                device: { family: 'Mac', model: 'MacBook Pro' },
                runtime: { name: 'node', version: '20.11.0' },
              },
              tags: {
                service: 'dashboard-api',
                environment: 'production',
                release: 'v2.14.3',
                transaction: '/api/dashboard/data',
                level: 'error',
              },
              user: {
                id: 'user-42',
                email: 'alice@example.com',
                ip_address: '192.168.1.42',
              },
              exception: {
                values: [
                  {
                    type: 'DashboardApiError',
                    value: 'Failed to fetch dashboard data: upstream service returned 503',
                    stacktrace: {
                      frames: [
                        {
                          filename: 'dashboard-api/src/data-fetcher.ts',
                          function: 'fetchData',
                          lineno: 47,
                          colno: 12,
                          context_line:
                            'throw new DashboardApiError(`Failed to fetch dashboard data: ${response.statusText}`);',
                          pre_context: [
                            'const response = await fetch(url, { signal: controller.signal });',
                            'if (!response.ok) {',
                          ],
                          post_context: ['}', 'return response.json();'],
                        },
                        {
                          filename: 'dashboard-api/src/routes/dashboard.ts',
                          function: 'handleDashboardRequest',
                          lineno: 23,
                          colno: 18,
                          context_line: 'const data = await fetchData(params.dashboardId);',
                          pre_context: ['export async function handleDashboardRequest(req, res) {'],
                          post_context: ['res.json(data);'],
                        },
                      ],
                    },
                  },
                ],
              },
              breadcrumbs: [
                {
                  timestamp: '2026-03-21T08:14:55Z',
                  category: 'http',
                  message: 'GET /api/dashboard/data',
                  level: 'info',
                },
                {
                  timestamp: '2026-03-21T08:14:58Z',
                  category: 'http',
                  message: 'GET /api/upstream/metrics - 503',
                  level: 'warning',
                },
                {
                  timestamp: '2026-03-21T08:15:00Z',
                  category: 'error',
                  message: 'DashboardApiError thrown',
                  level: 'error',
                },
              ],
            },
          }),
        },
      ],
    })
  );

  server.tool(
    'list_error_events_in_project',
    'List recent error events across an entire Sentry project. Supports search queries and sorting by date or frequency. Use this for a broad view of errors affecting a project.',
    {
      organization_slug: z.string().describe('The slug of the Sentry organization'),
      project_slug: z.string().describe('The slug of the project'),
      query: z.string().optional().describe('Search query to filter events'),
      sort: z.enum(['date', 'freq']).optional().describe('Sort order for results'),
      cursor: z.string().optional().describe('Pagination cursor for fetching next page'),
      limit: z.number().optional().describe('Maximum number of events to return'),
    },
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            events: [
              {
                eventID: 'evt-a1b2c3d4',
                dateCreated: '2026-03-21T08:15:00Z',
                title: 'DashboardApiError: Failed to fetch dashboard data',
                issue: { id: '4821903', shortId: 'DASH-1A7' },
                tags: { service: 'dashboard-api', environment: 'production' },
              },
              {
                eventID: 'evt-m3n4o5p6',
                dateCreated: '2026-03-21T08:14:00Z',
                title: 'TimeoutError: Request timed out after 30000ms',
                issue: { id: '4821887', shortId: 'DASH-1A6' },
                tags: { service: 'dashboard-api', environment: 'production' },
              },
              {
                eventID: 'evt-q7r8s9t0',
                dateCreated: '2026-03-21T08:10:00Z',
                title: 'DashboardApiError: Failed to fetch dashboard data',
                issue: { id: '4821903', shortId: 'DASH-1A7' },
                tags: { service: 'dashboard-api', environment: 'production' },
              },
              {
                eventID: 'evt-u1v2w3x4',
                dateCreated: '2026-03-21T07:55:00Z',
                title: "TypeError: Cannot read properties of undefined (reading 'widgets')",
                issue: { id: '4820115', shortId: 'DASH-19F' },
                tags: { service: 'dashboard-app', environment: 'production' },
              },
            ],
            nextCursor: 'cursor-events-page2',
          }),
        },
      ],
    })
  );

  server.tool(
    'list_organization_replays',
    'List session replays for a Sentry organization. Replays capture user browser sessions including clicks, navigation, and console output. Filter by project, date range, or search query.',
    {
      organization_slug: z.string().describe('The slug of the Sentry organization'),
      project_slug: z.string().optional().describe('Filter replays by project slug'),
      start: z.string().optional().describe('Start datetime (ISO 8601)'),
      end: z.string().optional().describe('End datetime (ISO 8601)'),
      query: z.string().optional().describe('Search query to filter replays'),
      per_page: z.number().optional().describe('Number of replays per page'),
      cursor: z.string().optional().describe('Pagination cursor for fetching next page'),
    },
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            replays: [
              {
                id: 'replay-abc123',
                projectSlug: 'dashboard-app',
                startedAt: '2026-03-21T08:05:00Z',
                finishedAt: '2026-03-21T08:16:00Z',
                duration: 660,
                countErrors: 3,
                countUrls: 4,
                user: { id: 'user-42', email: 'alice@example.com' },
                urls: [
                  'https://app.example.com/login',
                  'https://app.example.com/dashboard',
                  'https://app.example.com/dashboard?retry=1',
                  'https://app.example.com/dashboard?retry=2',
                ],
                errorIds: ['evt-a1b2c3d4'],
                activity: 8,
                tags: { browser: 'Chrome 124', os: 'macOS 15.3' },
              },
              {
                id: 'replay-def456',
                projectSlug: 'dashboard-app',
                startedAt: '2026-03-21T08:08:00Z',
                finishedAt: '2026-03-21T08:13:00Z',
                duration: 300,
                countErrors: 2,
                countUrls: 2,
                user: { id: 'user-99', email: 'bob@example.com' },
                urls: ['https://app.example.com/dashboard', 'https://app.example.com/support'],
                errorIds: ['evt-e5f6g7h8'],
                activity: 5,
                tags: { browser: 'Firefox 125', os: 'Windows 11' },
              },
            ],
            nextCursor: null,
          }),
        },
      ],
    })
  );

  server.tool(
    'resolve_short_id',
    'Resolve a Sentry short ID (e.g. DASH-1A7) to the full issue details including numeric ID, project, and title. Short IDs are the compact identifiers shown in the Sentry UI.',
    {
      organization_slug: z.string().describe('The slug of the Sentry organization'),
      short_id: z.string().describe('The short ID to resolve (e.g. "PROJ-ABC")'),
    },
    async ({ short_id }) => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            group: {
              id: '4821903',
              shortId: short_id,
              title: 'DashboardApiError: Failed to fetch dashboard data',
              culprit: 'fetchData(dashboard-api/src/data-fetcher.ts)',
              status: 'unresolved',
              project: { slug: 'dashboard-app', name: 'Dashboard App' },
              count: 87,
              userCount: 42,
              firstSeen: '2026-03-21T06:45:00Z',
              lastSeen: '2026-03-21T08:15:00Z',
            },
          }),
        },
      ],
    })
  );

  server.tool(
    'create_project',
    'Create a new Sentry project within an organization and team. The project will be initialized with default alert rules and issue grouping settings for the specified platform.',
    {
      organization_slug: z.string().describe('The slug of the Sentry organization'),
      team_slug: z.string().describe('The slug of the team that will own the project'),
      project_name: z.string().describe('Display name for the new project'),
      platform: z
        .enum([
          'python',
          'javascript',
          'nodejs',
          'java',
          'go',
          'rust',
          'ruby',
          'php',
          'csharp',
          'swift',
          'kotlin',
        ])
        .describe('Platform/language for the project'),
    },
    async ({ organization_slug, team_slug, project_name, platform }) => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            project: {
              id: '5001',
              slug: project_name.toLowerCase().replace(/\s+/g, '-'),
              name: project_name,
              platform,
              organization: { slug: organization_slug },
              team: { slug: team_slug },
              dateCreated: '2026-03-21T09:00:00Z',
              status: 'active',
              dsn: {
                public: `https://abc123@o1.ingest.sentry.io/5001`,
              },
            },
          }),
        },
      ],
    })
  );

  server.tool(
    'setup_sentry',
    'Get setup instructions and configuration snippets for integrating Sentry into an existing project. Returns platform-specific installation steps, DSN configuration, and recommended SDK options.',
    {
      organization_slug: z.string().describe('The slug of the Sentry organization'),
      project_slug: z.string().describe('The slug of the project to set up'),
    },
    async ({ organization_slug, project_slug }) => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            setup: {
              project: { slug: project_slug, organization: organization_slug },
              dsn: `https://examplePublicKey@o1.ingest.sentry.io/1`,
              platform: 'javascript',
              installCommand: 'npm install @sentry/node --save',
              configSnippet: [
                "import * as Sentry from '@sentry/node';",
                '',
                'Sentry.init({',
                `  dsn: 'https://examplePublicKey@o1.ingest.sentry.io/1',`,
                '  tracesSampleRate: 1.0,',
                '  environment: process.env.NODE_ENV,',
                '});',
              ].join('\n'),
              verifyCommand: "node -e \"require('@sentry/node').captureMessage('Test')\"",
              docsUrl: `https://docs.sentry.io/platforms/javascript/guides/node/`,
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
    const port = portIdx !== -1 ? parseInt(args[portIdx + 1]!, 10) : 3001;
    serveHttp(createServer, port, 'sentry');
  } else {
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

main().catch((err) => {
  process.stderr.write(`sentry error: ${err}\n`);
  process.exit(1);
});
