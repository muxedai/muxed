import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { serveHttp } from './serve-http.ts';
import { z } from 'zod/v4';

// ---------------------------------------------------------------------------
// Mock data — tells the "dashboard investigation" story
// ---------------------------------------------------------------------------

const TEAM_ENGINEERING = {
  id: 'team-eng-001',
  name: 'Engineering',
  key: 'ENG',
  description: 'Core engineering team',
  memberCount: 24,
  createdAt: '2024-06-01T10:00:00Z',
};

const USER_ALICE = {
  id: 'user-alice-001',
  name: 'Alice Chen',
  email: 'alice@example.com',
  displayName: 'Alice Chen',
  active: true,
  admin: false,
  createdAt: '2024-06-02T09:00:00Z',
};

const USER_BOB = {
  id: 'user-bob-002',
  name: 'Bob Martinez',
  email: 'bob@example.com',
  displayName: 'Bob Martinez',
  active: true,
  admin: true,
  createdAt: '2024-06-01T10:00:00Z',
};

const USER_CAROL = {
  id: 'user-carol-003',
  name: 'Carol Wu',
  email: 'carol@example.com',
  displayName: 'Carol Wu',
  active: true,
  admin: false,
  createdAt: '2024-07-15T14:00:00Z',
};

const LABEL_BUG = { id: 'label-bug-001', name: 'Bug', color: '#eb5757', teamId: 'team-eng-001' };
const LABEL_P0 = {
  id: 'label-p0-002',
  name: 'P0-Incident',
  color: '#ff0000',
  teamId: 'team-eng-001',
};
const LABEL_PERF = {
  id: 'label-perf-003',
  name: 'Performance',
  color: '#f2994a',
  teamId: 'team-eng-001',
};
const LABEL_FRONTEND = {
  id: 'label-fe-004',
  name: 'Frontend',
  color: '#2f80ed',
  teamId: 'team-eng-001',
};

const ISSUE_1234 = {
  id: 'issue-1234',
  identifier: 'ENG-1234',
  title: 'Investigate dashboard loading performance degradation',
  description:
    'Multiple customers reporting dashboard not loading. Error rate spiked 340% since 08:10 UTC. ' +
    'Sentry shows repeated 504 Gateway Timeout from /api/v2/dashboards/render. ' +
    'Likely caused by the new analytics aggregation query deployed in v2.14.0. ' +
    'Need to identify root cause and roll back or hotfix ASAP.',
  state: { id: 'state-inp-001', name: 'In Progress', type: 'started' },
  priority: 1,
  priorityLabel: 'Urgent',
  assignee: USER_ALICE,
  team: TEAM_ENGINEERING,
  labels: [LABEL_BUG, LABEL_P0, LABEL_PERF],
  estimate: 3,
  createdAt: '2026-03-21T08:15:00Z',
  updatedAt: '2026-03-21T09:42:00Z',
  dueDate: '2026-03-21',
  url: 'https://linear.app/acme/issue/ENG-1234',
  comments: [
    {
      id: 'comment-001',
      body: 'Confirmed: the v2.14.0 analytics aggregation query is doing a full table scan on the events table. Rolling back to v2.13.2 in staging now.',
      userId: 'user-alice-001',
      createdAt: '2026-03-21T09:10:00Z',
    },
    {
      id: 'comment-002',
      body: 'Customer support has 12 open tickets referencing this. ETA would be very helpful.',
      userId: 'user-bob-002',
      createdAt: '2026-03-21T09:30:00Z',
    },
  ],
};

const ISSUE_1235 = {
  id: 'issue-1235',
  identifier: 'ENG-1235',
  title: 'Add caching layer for dashboard render endpoint',
  description:
    'Follow-up from ENG-1234. Implement Redis caching for the /api/v2/dashboards/render endpoint to prevent future performance regressions.',
  state: { id: 'state-todo-001', name: 'Todo', type: 'unstarted' },
  priority: 2,
  priorityLabel: 'High',
  assignee: USER_CAROL,
  team: TEAM_ENGINEERING,
  labels: [LABEL_PERF, LABEL_FRONTEND],
  estimate: 5,
  createdAt: '2026-03-21T10:00:00Z',
  updatedAt: '2026-03-21T10:00:00Z',
  dueDate: '2026-03-28',
  url: 'https://linear.app/acme/issue/ENG-1235',
  comments: [],
};

const ISSUE_1230 = {
  id: 'issue-1230',
  identifier: 'ENG-1230',
  title: 'Update user onboarding flow copy',
  description: 'Product wants updated copy on the onboarding wizard screens 2 and 3.',
  state: { id: 'state-done-001', name: 'Done', type: 'completed' },
  priority: 4,
  priorityLabel: 'Low',
  assignee: USER_BOB,
  team: TEAM_ENGINEERING,
  labels: [LABEL_FRONTEND],
  estimate: 1,
  createdAt: '2026-03-18T14:00:00Z',
  updatedAt: '2026-03-20T16:30:00Z',
  dueDate: null,
  url: 'https://linear.app/acme/issue/ENG-1230',
  comments: [],
};

const ALL_ISSUES = [ISSUE_1234, ISSUE_1235, ISSUE_1230];

const ACTIVE_CYCLE = {
  id: 'cycle-w12-001',
  name: 'Sprint 2026-W12',
  number: 12,
  startsAt: '2026-03-17T00:00:00Z',
  endsAt: '2026-03-23T23:59:59Z',
  teamId: 'team-eng-001',
  completedIssueCount: 8,
  totalIssueCount: 14,
  progress: 0.57,
  issueIds: ['issue-1234', 'issue-1235', 'issue-1230'],
};

const PROJECT_DASHBOARD_REVAMP = {
  id: 'project-dash-001',
  name: 'Dashboard Revamp',
  description: 'Complete overhaul of the analytics dashboard with real-time rendering.',
  status: 'started',
  teamIds: ['team-eng-001'],
  lead: USER_ALICE,
  startDate: '2026-02-01',
  targetDate: '2026-04-30',
  progress: 0.45,
  issueCount: 32,
  completedIssueCount: 14,
  createdAt: '2026-01-20T10:00:00Z',
  updatedAt: '2026-03-21T09:00:00Z',
};

const INITIATIVE_RELIABILITY = {
  id: 'initiative-rel-001',
  name: 'Platform Reliability H1 2026',
  description: 'Improve uptime to 99.95% and reduce p99 latency by 40%.',
  status: 'active',
  projectIds: ['project-dash-001'],
  createdAt: '2026-01-05T10:00:00Z',
  updatedAt: '2026-03-15T12:00:00Z',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ok(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data) }],
  };
}

function paginated(nodes: unknown[], limit?: number, after?: string) {
  let items = [...nodes];
  if (after) {
    const idx = items.findIndex((n: any) => n.id === after);
    if (idx !== -1) items = items.slice(idx + 1);
  }
  if (limit && limit > 0) items = items.slice(0, limit);
  return {
    nodes: items,
    pageInfo: {
      hasNextPage: false,
      endCursor: items.length > 0 ? (items[items.length - 1] as any).id : null,
    },
  };
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

function createServer(): McpServer {
  const server = new McpServer({ name: 'linear', version: '1.0.0' }, { capabilities: {} });

  // 1. linear_getIssues
  server.tool(
    'linear_getIssues',
    'List issues with optional filters for team, status, assignee, priority, and label',
    {
      teamId: z.string().optional().describe('Filter by team ID'),
      status: z
        .enum(['backlog', 'todo', 'in_progress', 'done', 'canceled'])
        .optional()
        .describe('Filter by issue status'),
      assigneeId: z.string().optional().describe('Filter by assignee user ID'),
      priority: z
        .number()
        .int()
        .min(0)
        .max(4)
        .optional()
        .describe('Filter by priority (0=none, 1=urgent, 2=high, 3=medium, 4=low)'),
      label: z.string().optional().describe('Filter by label name'),
      limit: z.number().int().optional().describe('Maximum number of results to return'),
      after: z.string().optional().describe('Cursor for pagination'),
    },
    async ({ teamId, status, assigneeId, priority, label, limit, after }) => {
      let issues = [...ALL_ISSUES];

      if (teamId) issues = issues.filter((i) => i.team.id === teamId);
      if (status) {
        const statusMap: Record<string, string> = {
          backlog: 'backlog',
          todo: 'unstarted',
          in_progress: 'started',
          done: 'completed',
          canceled: 'cancelled',
        };
        issues = issues.filter((i) => i.state.type === statusMap[status]);
      }
      if (assigneeId) issues = issues.filter((i) => i.assignee?.id === assigneeId);
      if (priority !== undefined) issues = issues.filter((i) => i.priority === priority);
      if (label) issues = issues.filter((i) => i.labels.some((l) => l.name === label));

      return ok(paginated(issues, limit, after));
    }
  );

  // 2. linear_searchIssues
  server.tool(
    'linear_searchIssues',
    'Search issues by text query across title, description, and comments',
    {
      query: z.string().describe('Search query string'),
      teamId: z.string().optional().describe('Filter by team ID'),
      includeArchived: z.boolean().optional().describe('Include archived issues in results'),
      limit: z.number().int().optional().describe('Maximum number of results to return'),
    },
    async ({ query, teamId, limit }) => {
      const q = query.toLowerCase();
      let issues = ALL_ISSUES.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q) ||
          i.identifier.toLowerCase().includes(q) ||
          i.comments.some((c) => c.body.toLowerCase().includes(q))
      );
      if (teamId) issues = issues.filter((i) => i.team.id === teamId);
      return ok(paginated(issues, limit));
    }
  );

  // 3. linear_createIssue
  server.tool(
    'linear_createIssue',
    'Create a new issue in a team',
    {
      title: z.string().describe('Issue title'),
      description: z.string().optional().describe('Issue description in markdown'),
      teamId: z.string().describe('Team ID to create the issue in'),
      assigneeId: z.string().optional().describe('User ID to assign the issue to'),
      priority: z
        .number()
        .int()
        .min(0)
        .max(4)
        .optional()
        .describe('Priority (0=none, 1=urgent, 2=high, 3=medium, 4=low)'),
      stateId: z.string().optional().describe('Workflow state ID'),
      labelIds: z.array(z.string()).optional().describe('Label IDs to attach'),
      estimate: z.number().optional().describe('Story point estimate'),
    },
    async ({ title, description, teamId, assigneeId, priority, stateId, labelIds, estimate }) => {
      const newIssue = {
        id: `issue-${Date.now()}`,
        identifier: 'ENG-1236',
        title,
        description: description ?? '',
        state: stateId
          ? { id: stateId, name: 'Backlog', type: 'backlog' }
          : { id: 'state-bl-001', name: 'Backlog', type: 'backlog' },
        priority: priority ?? 0,
        priorityLabel: ['None', 'Urgent', 'High', 'Medium', 'Low'][priority ?? 0],
        assignee: assigneeId ? { id: assigneeId } : null,
        team: { id: teamId },
        labels: (labelIds ?? []).map((lid) => ({ id: lid })),
        estimate: estimate ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        url: 'https://linear.app/acme/issue/ENG-1236',
      };
      return ok({ success: true, issue: newIssue });
    }
  );

  // 4. linear_getIssueById
  server.tool(
    'linear_getIssueById',
    'Get full details of an issue by its ID or identifier (e.g. ENG-1234)',
    {
      id: z.string().describe('Issue ID or identifier (e.g. "ENG-1234")'),
    },
    async ({ id }) => {
      const issue = ALL_ISSUES.find(
        (i) => i.id === id || i.identifier === id || i.identifier.toLowerCase() === id.toLowerCase()
      );
      if (!issue) {
        return ok({ error: 'Issue not found', id });
      }
      return ok(issue);
    }
  );

  // 5. linear_updateIssue
  server.tool(
    'linear_updateIssue',
    'Update fields on an existing issue',
    {
      id: z.string().describe('Issue ID or identifier'),
      title: z.string().optional().describe('New title'),
      description: z.string().optional().describe('New description'),
      assigneeId: z.string().optional().describe('New assignee user ID'),
      stateId: z.string().optional().describe('New workflow state ID'),
      priority: z
        .number()
        .int()
        .min(0)
        .max(4)
        .optional()
        .describe('New priority (0=none, 1=urgent, 2=high, 3=medium, 4=low)'),
      labelIds: z.array(z.string()).optional().describe('New label IDs (replaces existing)'),
    },
    async ({ id, title, description, assigneeId, stateId, priority, labelIds }) => {
      const issue = ALL_ISSUES.find(
        (i) => i.id === id || i.identifier === id || i.identifier.toLowerCase() === id.toLowerCase()
      );
      if (!issue) {
        return ok({ error: 'Issue not found', id });
      }
      const updated = {
        ...issue,
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(assigneeId !== undefined && { assignee: { id: assigneeId } }),
        ...(stateId !== undefined && { state: { id: stateId, name: 'Updated', type: 'started' } }),
        ...(priority !== undefined && {
          priority,
          priorityLabel: ['None', 'Urgent', 'High', 'Medium', 'Low'][priority],
        }),
        ...(labelIds !== undefined && { labels: labelIds.map((lid) => ({ id: lid })) }),
        updatedAt: new Date().toISOString(),
      };
      return ok({ success: true, issue: updated });
    }
  );

  // 6. linear_assignIssue
  server.tool(
    'linear_assignIssue',
    'Assign an issue to a user',
    {
      id: z.string().describe('Issue ID or identifier'),
      assigneeId: z.string().describe('User ID to assign the issue to'),
    },
    async ({ id, assigneeId }) => {
      const issue = ALL_ISSUES.find(
        (i) => i.id === id || i.identifier === id || i.identifier.toLowerCase() === id.toLowerCase()
      );
      if (!issue) {
        return ok({ error: 'Issue not found', id });
      }
      return ok({
        success: true,
        issue: { ...issue, assignee: { id: assigneeId }, updatedAt: new Date().toISOString() },
      });
    }
  );

  // 7. linear_setIssuePriority
  server.tool(
    'linear_setIssuePriority',
    'Set the priority of an issue (0=none, 1=urgent, 2=high, 3=medium, 4=low)',
    {
      id: z.string().describe('Issue ID or identifier'),
      priority: z
        .number()
        .int()
        .min(0)
        .max(4)
        .describe('Priority level: 0=none, 1=urgent, 2=high, 3=medium, 4=low'),
    },
    async ({ id, priority }) => {
      const issue = ALL_ISSUES.find(
        (i) => i.id === id || i.identifier === id || i.identifier.toLowerCase() === id.toLowerCase()
      );
      if (!issue) {
        return ok({ error: 'Issue not found', id });
      }
      return ok({
        success: true,
        issue: {
          ...issue,
          priority,
          priorityLabel: ['None', 'Urgent', 'High', 'Medium', 'Low'][priority],
          updatedAt: new Date().toISOString(),
        },
      });
    }
  );

  // 8. linear_getProjects
  server.tool(
    'linear_getProjects',
    'List projects with optional filters',
    {
      teamId: z.string().optional().describe('Filter by team ID'),
      status: z
        .enum(['planned', 'started', 'paused', 'completed', 'canceled'])
        .optional()
        .describe('Filter by project status'),
      limit: z.number().int().optional().describe('Maximum number of results to return'),
      after: z.string().optional().describe('Cursor for pagination'),
    },
    async ({ teamId, status, limit, after }) => {
      let projects = [PROJECT_DASHBOARD_REVAMP];
      if (teamId) projects = projects.filter((p) => p.teamIds.includes(teamId));
      if (status) projects = projects.filter((p) => p.status === status);
      return ok(paginated(projects, limit, after));
    }
  );

  // 9. linear_getTeams
  server.tool(
    'linear_getTeams',
    'List all teams in the workspace',
    {
      limit: z.number().int().optional().describe('Maximum number of results to return'),
      after: z.string().optional().describe('Cursor for pagination'),
    },
    async ({ limit, after }) => {
      return ok(paginated([TEAM_ENGINEERING], limit, after));
    }
  );

  // 10. linear_getUsers
  server.tool(
    'linear_getUsers',
    'List users in the workspace',
    {
      limit: z.number().int().optional().describe('Maximum number of results to return'),
      after: z.string().optional().describe('Cursor for pagination'),
      includeDisabled: z.boolean().optional().describe('Include disabled/deactivated users'),
    },
    async ({ limit, after }) => {
      return ok(paginated([USER_ALICE, USER_BOB, USER_CAROL], limit, after));
    }
  );

  // 11. linear_getCycles
  server.tool(
    'linear_getCycles',
    'List cycles (sprints) for a team',
    {
      teamId: z.string().optional().describe('Filter by team ID'),
      limit: z.number().int().optional().describe('Maximum number of results to return'),
      after: z.string().optional().describe('Cursor for pagination'),
    },
    async ({ teamId, limit, after }) => {
      let cycles = [
        ACTIVE_CYCLE,
        {
          id: 'cycle-w11-001',
          name: 'Sprint 2026-W11',
          number: 11,
          startsAt: '2026-03-10T00:00:00Z',
          endsAt: '2026-03-16T23:59:59Z',
          teamId: 'team-eng-001',
          completedIssueCount: 11,
          totalIssueCount: 11,
          progress: 1.0,
          issueIds: [],
        },
      ];
      if (teamId) cycles = cycles.filter((c) => c.teamId === teamId);
      return ok(paginated(cycles, limit, after));
    }
  );

  // 12. linear_getActiveCycle
  server.tool(
    'linear_getActiveCycle',
    'Get the currently active cycle (sprint) for a team',
    {
      teamId: z.string().optional().describe('Team ID (defaults to first team)'),
    },
    async ({ teamId }) => {
      if (teamId && teamId !== ACTIVE_CYCLE.teamId) {
        return ok({ error: 'No active cycle found for team', teamId });
      }
      return ok(ACTIVE_CYCLE);
    }
  );

  // 13. linear_getLabels
  server.tool(
    'linear_getLabels',
    'List labels, optionally filtered by team',
    {
      teamId: z.string().optional().describe('Filter by team ID'),
      limit: z.number().int().optional().describe('Maximum number of results to return'),
    },
    async ({ teamId, limit }) => {
      let labels = [LABEL_BUG, LABEL_P0, LABEL_PERF, LABEL_FRONTEND];
      if (teamId) labels = labels.filter((l) => l.teamId === teamId);
      return ok(paginated(labels, limit));
    }
  );

  // 14. linear_getInitiatives
  server.tool(
    'linear_getInitiatives',
    'List strategic initiatives',
    {
      limit: z.number().int().optional().describe('Maximum number of results to return'),
      after: z.string().optional().describe('Cursor for pagination'),
    },
    async ({ limit, after }) => {
      return ok(paginated([INITIATIVE_RELIABILITY], limit, after));
    }
  );

  // 15. linear_addComment
  server.tool(
    'linear_addComment',
    'Add a comment to an issue',
    {
      issueId: z.string().describe('Issue ID or identifier to comment on'),
      body: z.string().describe('Comment body in markdown'),
    },
    async ({ issueId, body }) => {
      const issue = ALL_ISSUES.find(
        (i) =>
          i.id === issueId ||
          i.identifier === issueId ||
          i.identifier.toLowerCase() === issueId.toLowerCase()
      );
      if (!issue) {
        return ok({ error: 'Issue not found', issueId });
      }
      const comment = {
        id: `comment-${Date.now()}`,
        body,
        issueId: issue.id,
        userId: 'user-alice-001',
        createdAt: new Date().toISOString(),
      };
      return ok({ success: true, comment });
    }
  );

  return server;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--http')) {
    const portIdx = args.indexOf('--port');
    const port = portIdx !== -1 ? parseInt(args[portIdx + 1]!, 10) : 3003;
    serveHttp(createServer, port, 'linear');
  } else {
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

main().catch((err) => {
  process.stderr.write(`linear error: ${err}\n`);
  process.exit(1);
});
