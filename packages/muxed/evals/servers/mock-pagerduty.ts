import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { serveHttp } from './serve-http.ts';
import { z } from 'zod/v4';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const ESCALATION_POLICY = {
  id: 'PESCAL01',
  name: 'Dashboard API Escalation',
  num_loops: 2,
  escalation_rules: [
    {
      escalation_delay_in_minutes: 10,
      targets: [{ type: 'user_reference', id: 'PUSER01', name: 'Alice Zhang' }],
    },
    {
      escalation_delay_in_minutes: 30,
      targets: [{ type: 'schedule_reference', id: 'PSCHED01', name: 'Primary On-Call' }],
    },
  ],
};

const SERVICE = {
  id: 'PSVC01',
  name: 'dashboard-api',
  description: 'Dashboard backend API service',
  status: 'warning',
  created_at: '2025-06-10T09:00:00Z',
  updated_at: '2026-03-21T08:14:00Z',
  escalation_policy: { id: ESCALATION_POLICY.id, name: ESCALATION_POLICY.name },
  teams: [{ id: 'PTEAM01', name: 'Platform Engineering' }],
  integrations: [
    {
      id: 'PINT01',
      type: 'datadog_inbound_integration',
      name: 'Datadog',
      created_at: '2025-07-01T10:00:00Z',
    },
  ],
};

const INCIDENT = {
  id: 'PINC001',
  incident_number: 4217,
  title: 'Dashboard API degradation — elevated error rates',
  description:
    'Error rate for /api/v2/dashboard endpoints has exceeded 15% for the past 10 minutes. Median latency is 4.2s (normal < 200ms).',
  status: 'acknowledged',
  urgency: 'high',
  priority: { id: 'P2', name: 'P2', description: 'High' },
  created_at: '2026-03-21T08:12:00Z',
  updated_at: '2026-03-21T08:15:30Z',
  service: { id: SERVICE.id, name: SERVICE.name },
  escalation_policy: { id: ESCALATION_POLICY.id, name: ESCALATION_POLICY.name },
  teams: [{ id: 'PTEAM01', name: 'Platform Engineering' }],
  assignments: [
    {
      at: '2026-03-21T08:15:30Z',
      assignee: { id: 'PUSER01', name: 'Alice Zhang', email: 'alice@example.com' },
    },
  ],
  acknowledgements: [
    {
      at: '2026-03-21T08:15:30Z',
      acknowledger: { id: 'PUSER01', name: 'Alice Zhang', email: 'alice@example.com' },
    },
  ],
  last_status_change_at: '2026-03-21T08:15:30Z',
  last_status_change_by: { id: 'PUSER01', name: 'Alice Zhang' },
  html_url: 'https://acme.pagerduty.com/incidents/PINC001',
  notes: [],
  responders: [],
};

const SCHEDULE = {
  id: 'PSCHED01',
  name: 'Primary On-Call',
  description: 'Primary on-call rotation for Platform Engineering',
  time_zone: 'America/New_York',
  escalation_policies: [{ id: ESCALATION_POLICY.id, name: ESCALATION_POLICY.name }],
  users: [
    { id: 'PUSER01', name: 'Alice Zhang', email: 'alice@example.com' },
    { id: 'PUSER02', name: 'Bob Martinez', email: 'bob@example.com' },
    { id: 'PUSER03', name: 'Charlie Okonkwo', email: 'charlie@example.com' },
  ],
  final_schedule: {
    rendered_schedule_entries: [
      {
        start: '2026-03-20T09:00:00-04:00',
        end: '2026-03-27T09:00:00-04:00',
        user: { id: 'PUSER01', name: 'Alice Zhang', email: 'alice@example.com' },
      },
    ],
  },
};

const TEAMS = [
  {
    id: 'PTEAM01',
    name: 'Platform Engineering',
    description: 'Owns core platform infrastructure and APIs',
    members: [
      { user: { id: 'PUSER01', name: 'Alice Zhang', email: 'alice@example.com' }, role: 'manager' },
      {
        user: { id: 'PUSER02', name: 'Bob Martinez', email: 'bob@example.com' },
        role: 'responder',
      },
      {
        user: { id: 'PUSER03', name: 'Charlie Okonkwo', email: 'charlie@example.com' },
        role: 'responder',
      },
    ],
  },
  {
    id: 'PTEAM02',
    name: 'Frontend',
    description: 'Owns the web application layer',
    members: [
      { user: { id: 'PUSER04', name: 'Dana Singh', email: 'dana@example.com' }, role: 'manager' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

function createServer(): McpServer {
  const server = new McpServer({ name: 'pagerduty', version: '1.0.0' }, { capabilities: {} });

  // 1. list_incidents
  server.tool(
    'list_incidents',
    'List incidents filtered by status, urgency, date range, service, or team',
    {
      statuses: z
        .array(z.enum(['triggered', 'acknowledged', 'resolved']))
        .optional()
        .describe('Filter by incident statuses'),
      urgencies: z
        .array(z.enum(['high', 'low']))
        .optional()
        .describe('Filter by urgency levels'),
      since: z.string().optional().describe('Start of date range (ISO 8601)'),
      until: z.string().optional().describe('End of date range (ISO 8601)'),
      sort_by: z
        .enum(['created_at', 'resolved_at', 'urgency'])
        .optional()
        .describe('Field to sort results by'),
      service_ids: z.array(z.string()).optional().describe('Filter by service IDs'),
      team_ids: z.array(z.string()).optional().describe('Filter by team IDs'),
      limit: z.number().optional().describe('Maximum number of results to return'),
      offset: z.number().optional().describe('Pagination offset'),
    },
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            incidents: [INCIDENT],
            limit: 25,
            offset: 0,
            total: 1,
            more: false,
          }),
        },
      ],
    })
  );

  // 2. get_incident
  server.tool(
    'get_incident',
    'Get details of a specific incident by ID',
    {
      id: z.string().describe('Incident ID'),
    },
    async ({ id }) => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            incident: { ...INCIDENT, id },
          }),
        },
      ],
    })
  );

  // 3. create_incident
  server.tool(
    'create_incident',
    'Create a new incident on a service',
    {
      title: z.string().describe('Incident title'),
      service_id: z.string().describe('ID of the service to create the incident on'),
      urgency: z.enum(['high', 'low']).optional().describe('Incident urgency'),
      body: z.string().optional().describe('Incident description body'),
      escalation_policy_id: z.string().optional().describe('Escalation policy ID to assign'),
    },
    async ({ title, service_id, urgency, body }) => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            incident: {
              id: 'PINC002',
              incident_number: 4218,
              title,
              description: body ?? '',
              status: 'triggered',
              urgency: urgency ?? 'high',
              created_at: '2026-03-21T09:00:00Z',
              service: { id: service_id, name: SERVICE.name },
              html_url: 'https://acme.pagerduty.com/incidents/PINC002',
            },
          }),
        },
      ],
    })
  );

  // 4. update_incident_status
  server.tool(
    'update_incident_status',
    'Acknowledge or resolve an incident',
    {
      id: z.string().describe('Incident ID'),
      status: z.enum(['acknowledged', 'resolved']).describe('New status for the incident'),
    },
    async ({ id, status }) => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            incident: {
              ...INCIDENT,
              id,
              status,
              last_status_change_at: '2026-03-21T09:05:00Z',
            },
          }),
        },
      ],
    })
  );

  // 5. update_incident_urgency
  server.tool(
    'update_incident_urgency',
    'Change the urgency of an incident',
    {
      id: z.string().describe('Incident ID'),
      urgency: z.enum(['high', 'low']).describe('New urgency level'),
    },
    async ({ id, urgency }) => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            incident: {
              ...INCIDENT,
              id,
              urgency,
              updated_at: '2026-03-21T09:06:00Z',
            },
          }),
        },
      ],
    })
  );

  // 6. add_incident_note
  server.tool(
    'add_incident_note',
    'Add a note to an incident timeline',
    {
      id: z.string().describe('Incident ID'),
      content: z.string().describe('Note content'),
    },
    async ({ id, content: noteContent }) => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            note: {
              id: 'PNOTE01',
              incident_id: id,
              content: noteContent,
              created_at: '2026-03-21T09:10:00Z',
              user: { id: 'PUSER01', name: 'Alice Zhang', email: 'alice@example.com' },
            },
          }),
        },
      ],
    })
  );

  // 7. add_incident_responder
  server.tool(
    'add_incident_responder',
    'Request an additional responder for an incident',
    {
      id: z.string().describe('Incident ID'),
      user_id: z.string().describe('User ID of the responder to add'),
      message: z.string().optional().describe('Message to include with the responder request'),
    },
    async ({ id, user_id, message }) => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            responder_request: {
              incident_id: id,
              requester: { id: 'PUSER01', name: 'Alice Zhang' },
              requested_responder: { id: user_id, name: 'Bob Martinez', email: 'bob@example.com' },
              message: message ?? '',
              state: 'pending',
              requested_at: '2026-03-21T09:12:00Z',
            },
          }),
        },
      ],
    })
  );

  // 8. list_services
  server.tool(
    'list_services',
    'List PagerDuty services, optionally filtered by name or team',
    {
      query: z.string().optional().describe('Search query to filter services by name'),
      team_ids: z.array(z.string()).optional().describe('Filter by team IDs'),
      include: z
        .array(z.enum(['escalation_policies', 'teams', 'integrations']))
        .optional()
        .describe('Additional data to include in the response'),
      limit: z.number().optional().describe('Maximum number of results to return'),
      offset: z.number().optional().describe('Pagination offset'),
    },
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            services: [SERVICE],
            limit: 25,
            offset: 0,
            total: 1,
            more: false,
          }),
        },
      ],
    })
  );

  // 9. get_service
  server.tool(
    'get_service',
    'Get details of a specific PagerDuty service',
    {
      id: z.string().describe('Service ID'),
      include: z
        .array(z.enum(['escalation_policies', 'teams', 'integrations']))
        .optional()
        .describe('Additional data to include in the response'),
    },
    async ({ id }) => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            service: { ...SERVICE, id },
          }),
        },
      ],
    })
  );

  // 10. get_service_integrations
  server.tool(
    'get_service_integrations',
    'List integrations configured on a service',
    {
      service_id: z.string().describe('Service ID'),
    },
    async ({ service_id }) => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            integrations: SERVICE.integrations.map((i) => ({
              ...i,
              service: { id: service_id, name: SERVICE.name },
            })),
          }),
        },
      ],
    })
  );

  // 11. list_schedules
  server.tool(
    'list_schedules',
    'List on-call schedules',
    {
      query: z.string().optional().describe('Search query to filter schedules by name'),
      limit: z.number().optional().describe('Maximum number of results to return'),
      offset: z.number().optional().describe('Pagination offset'),
    },
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            schedules: [
              {
                id: SCHEDULE.id,
                name: SCHEDULE.name,
                description: SCHEDULE.description,
                time_zone: SCHEDULE.time_zone,
                escalation_policies: SCHEDULE.escalation_policies,
              },
            ],
            limit: 25,
            offset: 0,
            total: 1,
            more: false,
          }),
        },
      ],
    })
  );

  // 12. get_schedule
  server.tool(
    'get_schedule',
    'Get a specific on-call schedule with rendered entries',
    {
      id: z.string().describe('Schedule ID'),
      since: z.string().optional().describe('Start of the date range (ISO 8601)'),
      until: z.string().optional().describe('End of the date range (ISO 8601)'),
      overflow: z.boolean().optional().describe('Include overflow entries'),
    },
    async ({ id }) => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            schedule: { ...SCHEDULE, id },
          }),
        },
      ],
    })
  );

  // 13. list_schedule_users
  server.tool(
    'list_schedule_users',
    'List users who are part of an on-call schedule',
    {
      schedule_id: z.string().describe('Schedule ID'),
      since: z.string().optional().describe('Start of the date range (ISO 8601)'),
      until: z.string().optional().describe('End of the date range (ISO 8601)'),
    },
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            users: SCHEDULE.users,
          }),
        },
      ],
    })
  );

  // 14. list_teams
  server.tool(
    'list_teams',
    'List teams in the PagerDuty account',
    {
      query: z.string().optional().describe('Search query to filter teams by name'),
      limit: z.number().optional().describe('Maximum number of results to return'),
      offset: z.number().optional().describe('Pagination offset'),
    },
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            teams: TEAMS,
            limit: 25,
            offset: 0,
            total: TEAMS.length,
            more: false,
          }),
        },
      ],
    })
  );

  // 15. get_team
  server.tool(
    'get_team',
    'Get details of a specific team',
    {
      id: z.string().describe('Team ID'),
    },
    async ({ id }) => {
      const team = TEAMS.find((t) => t.id === id) ?? TEAMS[0]!;
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ team: { ...team, id } }),
          },
        ],
      };
    }
  );

  // 16. list_oncall_users
  server.tool(
    'list_oncall_users',
    'List users currently on call, optionally filtered by schedule or escalation policy',
    {
      schedule_ids: z.array(z.string()).optional().describe('Filter by schedule IDs'),
      escalation_policy_ids: z
        .array(z.string())
        .optional()
        .describe('Filter by escalation policy IDs'),
      since: z.string().optional().describe('Start of the date range (ISO 8601)'),
      until: z.string().optional().describe('End of the date range (ISO 8601)'),
    },
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            oncalls: [
              {
                user: { id: 'PUSER01', name: 'Alice Zhang', email: 'alice@example.com' },
                schedule: { id: SCHEDULE.id, name: SCHEDULE.name },
                escalation_policy: {
                  id: ESCALATION_POLICY.id,
                  name: ESCALATION_POLICY.name,
                },
                escalation_level: 1,
                start: '2026-03-20T09:00:00-04:00',
                end: '2026-03-27T09:00:00-04:00',
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
    serveHttp(createServer, port, 'pagerduty');
  } else {
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

main().catch((err) => {
  process.stderr.write(`pagerduty error: ${err}\n`);
  process.exit(1);
});
