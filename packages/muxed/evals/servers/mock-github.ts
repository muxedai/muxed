import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { serveHttp } from './serve-http.ts';
import { z } from 'zod/v4';

function createServer(): McpServer {
  const server = new McpServer({ name: 'github', version: '1.0.0' }, { capabilities: {} });

  // 1. search_repositories
  server.tool(
    'search_repositories',
    'Search for GitHub repositories',
    {
      query: z.string().describe('Search query'),
      sort: z.enum(['stars', 'forks', 'updated', 'best-match']).optional().describe('Sort field'),
      order: z.enum(['asc', 'desc']).optional().describe('Sort order'),
      per_page: z.number().optional().describe('Results per page (max 100)'),
      page: z.number().optional().describe('Page number'),
    },
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            total_count: 1,
            incomplete_results: false,
            items: [
              {
                id: 98765,
                full_name: 'acme/dashboard-app',
                description: 'Internal dashboard application for ACME Corp',
                html_url: 'https://github.com/acme/dashboard-app',
                language: 'TypeScript',
                stargazers_count: 42,
                forks_count: 8,
                open_issues_count: 15,
                default_branch: 'main',
                updated_at: '2026-04-05T09:30:00Z',
                topics: ['dashboard', 'internal', 'typescript', 'react'],
                visibility: 'private',
                owner: { login: 'acme', type: 'Organization' },
              },
            ],
          }),
        },
      ],
    })
  );

  // 2. create_issue
  server.tool(
    'create_issue',
    'Create a new issue in a GitHub repository',
    {
      owner: z.string().describe('Repository owner'),
      repo: z.string().describe('Repository name'),
      title: z.string().describe('Issue title'),
      body: z.string().optional().describe('Issue body (Markdown)'),
      assignees: z.array(z.string()).optional().describe('Usernames to assign'),
      labels: z.array(z.string()).optional().describe('Labels to apply'),
      milestone: z.number().optional().describe('Milestone number'),
    },
    async ({ owner, repo, title, body, assignees, labels }) => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            id: 200001,
            number: 901,
            title,
            body: body ?? '',
            state: 'open',
            html_url: `https://github.com/${owner}/${repo}/issues/901`,
            user: { login: 'assistant-bot' },
            assignees: (assignees ?? []).map((a) => ({ login: a })),
            labels: (labels ?? []).map((l) => ({ name: l })),
            created_at: '2026-04-05T12:00:00Z',
            updated_at: '2026-04-05T12:00:00Z',
          }),
        },
      ],
    })
  );

  // 3. search_issues
  server.tool(
    'search_issues',
    'Search for issues and pull requests across GitHub',
    {
      q: z.string().describe("GitHub search syntax, e.g. 'is:issue is:open dashboard'"),
      sort: z
        .enum(['created', 'updated', 'comments', 'reactions'])
        .optional()
        .describe('Sort field'),
      order: z.enum(['asc', 'desc']).optional().describe('Sort order'),
      per_page: z.number().optional().describe('Results per page (max 100)'),
      page: z.number().optional().describe('Page number'),
    },
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            total_count: 1,
            incomplete_results: false,
            items: [
              {
                id: 150001,
                number: 892,
                title: 'Dashboard loading errors after new-dashboard-api flag rollout',
                state: 'open',
                html_url: 'https://github.com/acme/dashboard-app/issues/892',
                user: { login: 'carol' },
                labels: [
                  { name: 'bug', color: 'd73a4a' },
                  { name: 'P1', color: 'e11d48' },
                ],
                assignees: [{ login: 'alice' }],
                created_at: '2026-04-04T14:22:00Z',
                updated_at: '2026-04-05T08:10:00Z',
                comments: 7,
                body: 'Users in the 50% rollout cohort are seeing intermittent 500 errors on the dashboard.',
              },
            ],
          }),
        },
      ],
    })
  );

  // 4. get_issue
  server.tool(
    'get_issue',
    'Get details of a specific issue',
    {
      owner: z.string().describe('Repository owner'),
      repo: z.string().describe('Repository name'),
      issue_number: z.number().describe('Issue number'),
    },
    async ({ owner, repo, issue_number }) => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            id: 150001,
            number: issue_number,
            title: 'Dashboard loading errors after new-dashboard-api flag rollout',
            state: 'open',
            html_url: `https://github.com/${owner}/${repo}/issues/${issue_number}`,
            user: { login: 'carol' },
            labels: [
              { name: 'bug', color: 'd73a4a' },
              { name: 'P1', color: 'e11d48' },
            ],
            assignees: [{ login: 'alice' }],
            milestone: { number: 12, title: 'Q2 2026 Stability' },
            created_at: '2026-04-04T14:22:00Z',
            updated_at: '2026-04-05T08:10:00Z',
            comments: 7,
            body: [
              '## Description',
              '',
              'After the `new-dashboard-api` feature flag was rolled out to 50% of users, we are seeing intermittent 500 errors on the main dashboard page.',
              '',
              '### Symptoms',
              '- Dashboard fails to load for ~30% of requests in the affected cohort',
              '- Error responses come from `dashboard-api/src/routes/overview.ts`',
              "- Logs show `TypeError: Cannot read properties of undefined (reading 'metrics')`",
              '- The issue started 2026-04-03 around 16:00 UTC, roughly 2 hours after PR #4521 was merged',
              '',
              '### Steps to reproduce',
              '1. Enable the `new-dashboard-api` flag for your account',
              '2. Navigate to /dashboard/overview',
              '3. Observe intermittent 500 errors (about 1 in 3 page loads)',
              '',
              '### Impact',
              '- ~50% of users are in the rollout cohort',
              '- Of those, ~30% of page loads fail',
              '- Effectively ~15% of all dashboard page loads are broken',
              '',
              '### Suspected root cause',
              'PR #4521 ("Migrate dashboard API to new data pipeline") changed the query layer but the new pipeline returns a different response shape for the `metrics` field when the upstream data service has not finished its migration. See the `upstream-data-service` dependency.',
            ].join('\n'),
            reactions: { '+1': 12, '-1': 0, confused: 3 },
          }),
        },
      ],
    })
  );

  // 5. update_issue
  server.tool(
    'update_issue',
    'Update an existing issue',
    {
      owner: z.string().describe('Repository owner'),
      repo: z.string().describe('Repository name'),
      issue_number: z.number().describe('Issue number'),
      title: z.string().optional().describe('New title'),
      body: z.string().optional().describe('New body (Markdown)'),
      state: z.enum(['open', 'closed']).optional().describe('Issue state'),
      labels: z.array(z.string()).optional().describe('Labels to set'),
      assignees: z.array(z.string()).optional().describe('Usernames to assign'),
    },
    async ({ owner, repo, issue_number, title, state, labels, assignees }) => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            id: 150001,
            number: issue_number,
            title: title ?? 'Dashboard loading errors after new-dashboard-api flag rollout',
            state: state ?? 'open',
            html_url: `https://github.com/${owner}/${repo}/issues/${issue_number}`,
            user: { login: 'carol' },
            labels: (labels ?? ['bug', 'P1']).map((l) => ({ name: l })),
            assignees: (assignees ?? ['alice']).map((a) => ({ login: a })),
            updated_at: '2026-04-05T12:05:00Z',
          }),
        },
      ],
    })
  );

  // 6. create_pull_request
  server.tool(
    'create_pull_request',
    'Create a new pull request',
    {
      owner: z.string().describe('Repository owner'),
      repo: z.string().describe('Repository name'),
      title: z.string().describe('PR title'),
      body: z.string().optional().describe('PR body (Markdown)'),
      head: z.string().describe('Branch to merge from'),
      base: z.string().describe('Branch to merge into'),
      draft: z.boolean().optional().describe('Create as draft PR'),
      maintainer_can_modify: z.boolean().optional().describe('Allow maintainer edits'),
    },
    async ({ owner, repo, title, body, head, base, draft }) => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            id: 300001,
            number: 4530,
            title,
            body: body ?? '',
            state: 'open',
            draft: draft ?? false,
            html_url: `https://github.com/${owner}/${repo}/pull/4530`,
            head: { ref: head, label: `${owner}:${head}` },
            base: { ref: base, label: `${owner}:${base}` },
            user: { login: 'assistant-bot' },
            created_at: '2026-04-05T12:00:00Z',
            updated_at: '2026-04-05T12:00:00Z',
            mergeable: true,
          }),
        },
      ],
    })
  );

  // 7. list_pull_requests
  server.tool(
    'list_pull_requests',
    'List pull requests in a repository',
    {
      owner: z.string().describe('Repository owner'),
      repo: z.string().describe('Repository name'),
      state: z.enum(['open', 'closed', 'all']).optional().describe('PR state filter'),
      head: z.string().optional().describe('Filter by head branch (user:ref-name)'),
      base: z.string().optional().describe('Filter by base branch'),
      sort: z
        .enum(['created', 'updated', 'popularity', 'long-running'])
        .optional()
        .describe('Sort field'),
      direction: z.enum(['asc', 'desc']).optional().describe('Sort direction'),
      per_page: z.number().optional().describe('Results per page (max 100)'),
      page: z.number().optional().describe('Page number'),
    },
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify([
            {
              id: 300010,
              number: 4525,
              title: 'Bump upstream-data-service memory limit',
              state: 'open',
              draft: false,
              html_url: 'https://github.com/acme/dashboard-app/pull/4525',
              user: { login: 'alice' },
              head: { ref: 'fix/upstream-memory', label: 'acme:fix/upstream-memory' },
              base: { ref: 'main', label: 'acme:main' },
              created_at: '2026-04-05T08:45:00Z',
              updated_at: '2026-04-05T09:30:00Z',
              labels: [{ name: 'infra' }, { name: 'urgent' }],
              requested_reviewers: [{ login: 'bob' }],
              body: 'The upstream-data-service is OOMing under the new query load from the migrated dashboard API. This bumps the memory limit from 512Mi to 1Gi and adds a circuit breaker for the metrics endpoint.',
            },
            {
              id: 300008,
              number: 4521,
              title: 'Migrate dashboard API to new data pipeline',
              state: 'closed',
              merged: true,
              merged_at: '2026-04-03T15:48:00Z',
              html_url: 'https://github.com/acme/dashboard-app/pull/4521',
              user: { login: 'alice' },
              head: { ref: 'feat/new-data-pipeline', label: 'acme:feat/new-data-pipeline' },
              base: { ref: 'main', label: 'acme:main' },
              created_at: '2026-03-28T10:00:00Z',
              updated_at: '2026-04-03T15:48:00Z',
              labels: [{ name: 'feature' }, { name: 'dashboard' }],
              body: 'Migrates the dashboard API queries from the legacy data layer to the new data pipeline. This is gated behind the `new-dashboard-api` feature flag.\n\n## Changes\n- New query builders in `dashboard-api/src/queries/`\n- Updated route handlers to use pipeline client\n- Added fallback to legacy queries when flag is disabled\n\n## Testing\n- Unit tests for all new query builders\n- Integration tests against staging pipeline\n- Canary deployment with 10% rollout for 48h (no issues observed)',
              merge_commit_sha: 'a1b2c3d4e5f6',
              review_comments: 14,
              additions: 1847,
              deletions: 423,
            },
            {
              id: 300005,
              number: 4518,
              title: 'Add rate limiting to public API endpoints',
              state: 'closed',
              merged: true,
              merged_at: '2026-04-02T11:20:00Z',
              html_url: 'https://github.com/acme/dashboard-app/pull/4518',
              user: { login: 'bob' },
              head: { ref: 'feat/rate-limiting', label: 'acme:feat/rate-limiting' },
              base: { ref: 'main', label: 'acme:main' },
              created_at: '2026-03-30T09:00:00Z',
              updated_at: '2026-04-02T11:20:00Z',
              labels: [{ name: 'security' }],
              body: 'Adds rate limiting middleware to all public API endpoints.',
            },
          ]),
        },
      ],
    })
  );

  // 8. get_repository
  server.tool(
    'get_repository',
    'Get details of a GitHub repository',
    {
      owner: z.string().describe('Repository owner'),
      repo: z.string().describe('Repository name'),
    },
    async ({ owner, repo }) => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            id: 98765,
            full_name: `${owner}/${repo}`,
            description: 'Internal dashboard application for ACME Corp',
            html_url: `https://github.com/${owner}/${repo}`,
            language: 'TypeScript',
            stargazers_count: 42,
            forks_count: 8,
            open_issues_count: 15,
            default_branch: 'main',
            created_at: '2024-06-15T10:00:00Z',
            updated_at: '2026-04-05T09:30:00Z',
            pushed_at: '2026-04-05T08:45:00Z',
            size: 28540,
            topics: ['dashboard', 'internal', 'typescript', 'react'],
            visibility: 'private',
            owner: { login: owner, type: 'Organization' },
            permissions: { admin: false, push: true, pull: true },
            has_issues: true,
            has_wiki: false,
            archived: false,
          }),
        },
      ],
    })
  );

  // 9. list_commits
  server.tool(
    'list_commits',
    'List commits in a repository',
    {
      owner: z.string().describe('Repository owner'),
      repo: z.string().describe('Repository name'),
      sha: z.string().optional().describe('Branch name or commit SHA'),
      since: z.string().optional().describe('ISO 8601 date — only commits after this date'),
      until: z.string().optional().describe('ISO 8601 date — only commits before this date'),
      author: z.string().optional().describe('GitHub login or email to filter by'),
      per_page: z.number().optional().describe('Results per page (max 100)'),
      page: z.number().optional().describe('Page number'),
    },
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify([
            {
              sha: 'f9e8d7c6b5a4',
              commit: {
                message: 'fix: increase upstream-data-service timeout to 30s',
                author: {
                  name: 'Alice Chen',
                  email: 'alice@acme.com',
                  date: '2026-04-05T08:40:00Z',
                },
              },
              html_url: 'https://github.com/acme/dashboard-app/commit/f9e8d7c6b5a4',
              author: { login: 'alice' },
            },
            {
              sha: 'e7d6c5b4a3f2',
              commit: {
                message: 'feat: add new-dashboard-api feature flag',
                author: {
                  name: 'Alice Chen',
                  email: 'alice@acme.com',
                  date: '2026-04-03T16:10:00Z',
                },
              },
              html_url: 'https://github.com/acme/dashboard-app/commit/e7d6c5b4a3f2',
              author: { login: 'alice' },
            },
            {
              sha: 'a1b2c3d4e5f6',
              commit: {
                message: 'refactor: migrate to new data pipeline queries (#4521)',
                author: {
                  name: 'Alice Chen',
                  email: 'alice@acme.com',
                  date: '2026-04-03T15:48:00Z',
                },
              },
              html_url: 'https://github.com/acme/dashboard-app/commit/a1b2c3d4e5f6',
              author: { login: 'alice' },
            },
            {
              sha: 'b2c3d4e5f6a7',
              commit: {
                message: 'feat: add rate limiting to public API endpoints (#4518)',
                author: { name: 'Bob Park', email: 'bob@acme.com', date: '2026-04-02T11:20:00Z' },
              },
              html_url: 'https://github.com/acme/dashboard-app/commit/b2c3d4e5f6a7',
              author: { login: 'bob' },
            },
            {
              sha: 'c3d4e5f6a7b8',
              commit: {
                message: 'chore: update dependencies',
                author: { name: 'Bob Park', email: 'bob@acme.com', date: '2026-04-01T09:00:00Z' },
              },
              html_url: 'https://github.com/acme/dashboard-app/commit/c3d4e5f6a7b8',
              author: { login: 'bob' },
            },
          ]),
        },
      ],
    })
  );

  // 10. search_code
  server.tool(
    'search_code',
    'Search for code across GitHub repositories',
    {
      q: z.string().describe('GitHub code search syntax'),
      sort: z.enum(['indexed', 'best-match']).optional().describe('Sort field'),
      order: z.enum(['asc', 'desc']).optional().describe('Sort order'),
      per_page: z.number().optional().describe('Results per page (max 100)'),
      page: z.number().optional().describe('Page number'),
    },
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            total_count: 4,
            incomplete_results: false,
            items: [
              {
                name: 'overview.ts',
                path: 'dashboard-api/src/routes/overview.ts',
                sha: 'abc123def456',
                html_url:
                  'https://github.com/acme/dashboard-app/blob/main/dashboard-api/src/routes/overview.ts',
                repository: { full_name: 'acme/dashboard-app' },
                text_matches: [
                  {
                    fragment:
                      "if (isFeatureEnabled('new-dashboard-api', user)) {\n  const metrics = await pipelineClient.getMetrics(dashboardId);\n  return res.json({ metrics: metrics.data });\n}",
                    matches: [{ text: 'new-dashboard-api', indices: [22, 41] }],
                  },
                ],
              },
              {
                name: 'pipeline-client.ts',
                path: 'dashboard-api/src/clients/pipeline-client.ts',
                sha: 'def456abc789',
                html_url:
                  'https://github.com/acme/dashboard-app/blob/main/dashboard-api/src/clients/pipeline-client.ts',
                repository: { full_name: 'acme/dashboard-app' },
                text_matches: [
                  {
                    fragment:
                      '// Used by new-dashboard-api flag path\nexport async function getMetrics(dashboardId: string) {\n  const response = await upstreamService.query(dashboardId);\n  return response;\n}',
                    matches: [{ text: 'new-dashboard-api', indices: [10, 27] }],
                  },
                ],
              },
              {
                name: 'feature-flags.ts',
                path: 'dashboard-api/src/config/feature-flags.ts',
                sha: 'ghi789jkl012',
                html_url:
                  'https://github.com/acme/dashboard-app/blob/main/dashboard-api/src/config/feature-flags.ts',
                repository: { full_name: 'acme/dashboard-app' },
                text_matches: [
                  {
                    fragment:
                      "export const FLAGS = {\n  'new-dashboard-api': {\n    description: 'Route dashboard queries through new data pipeline',\n    rollout: 50,\n  },",
                    matches: [{ text: 'new-dashboard-api', indices: [25, 42] }],
                  },
                ],
              },
              {
                name: 'overview.test.ts',
                path: 'dashboard-api/src/routes/__tests__/overview.test.ts',
                sha: 'mno345pqr678',
                html_url:
                  'https://github.com/acme/dashboard-app/blob/main/dashboard-api/src/routes/__tests__/overview.test.ts',
                repository: { full_name: 'acme/dashboard-app' },
                text_matches: [
                  {
                    fragment:
                      "describe('overview route with new-dashboard-api flag', () => {\n  it('should return metrics from pipeline', async () => {",
                    matches: [{ text: 'new-dashboard-api', indices: [33, 50] }],
                  },
                ],
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
    const port = portIdx !== -1 ? parseInt(args[portIdx + 1]!, 10) : 3006;
    serveHttp(createServer, port, 'github');
  } else {
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

main().catch((err) => {
  process.stderr.write(`github error: ${err}\n`);
  process.exit(1);
});
