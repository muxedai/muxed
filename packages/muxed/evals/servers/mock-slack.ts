import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { serveHttp } from './serve-http.ts';
import { z } from 'zod/v4';

const channels = [
  {
    id: 'C001',
    name: 'general',
    is_archived: false,
    topic: 'Company-wide announcements',
    num_members: 142,
  },
  {
    id: 'C002',
    name: 'incidents',
    is_archived: false,
    topic: 'Active incident coordination',
    num_members: 38,
  },
  {
    id: 'C003',
    name: 'engineering',
    is_archived: false,
    topic: 'Engineering discussions',
    num_members: 67,
  },
  {
    id: 'C004',
    name: 'deploys',
    is_archived: false,
    topic: 'Deployment notifications',
    num_members: 45,
  },
  { id: 'C005', name: 'alerts', is_archived: false, topic: 'Automated alerting', num_members: 30 },
];

const users = [
  {
    id: 'U001',
    name: 'alice',
    real_name: 'Alice Chen',
    email: 'alice@example.com',
    title: 'Senior SRE',
    status_text: 'On-call this week',
    is_bot: false,
  },
  {
    id: 'U002',
    name: 'bob',
    real_name: 'Bob Martinez',
    email: 'bob@example.com',
    title: 'Platform Engineer',
    status_text: '',
    is_bot: false,
  },
  {
    id: 'U003',
    name: 'charlie',
    real_name: 'Charlie Kim',
    email: 'charlie@example.com',
    title: 'Engineering Manager',
    status_text: '',
    is_bot: false,
  },
  {
    id: 'U004',
    name: 'alert-bot',
    real_name: 'Alert Bot',
    email: '',
    title: '',
    status_text: '',
    is_bot: true,
  },
];

const incidentMessages = [
  {
    ts: '1711004520.000100',
    user: 'U004',
    text: ':rotating_light: ALERT: Dashboard API p99 latency > 5s',
    channel: 'C002',
  },
  {
    ts: '1711004580.000200',
    user: 'U004',
    text: ':rotating_light: ALERT: Dashboard API error rate > 5%',
    channel: 'C002',
  },
  {
    ts: '1711004720.000300',
    user: 'U001',
    text: '@oncall Dashboard API alerts firing - investigating',
    channel: 'C002',
  },
  {
    ts: '1711004900.000400',
    user: 'U001',
    text: 'Looks like upstream-data-service is OOM killed',
    channel: 'C002',
  },
  {
    ts: '1711005080.000500',
    user: 'U002',
    text: 'Feature flag new-dashboard-api was recently bumped to 50% - could be related',
    channel: 'C002',
  },
  {
    ts: '1711005120.000600',
    user: 'U004',
    text: ':rotating_light: ALERT: upstream-data-service pod restarts > 3 in 5m',
    channel: 'C002',
  },
  {
    ts: '1711005320.000700',
    user: 'U001',
    text: 'Scaling up upstream-data-service memory limit to 4Gi',
    channel: 'C002',
  },
  {
    ts: '1711005500.000800',
    user: 'U001',
    text: 'Memory limit bumped, pods stabilizing. Monitoring.',
    channel: 'C002',
  },
];

function getUserName(userId: string): string {
  return users.find((u) => u.id === userId)?.name ?? 'unknown';
}

function createServer(): McpServer {
  const server = new McpServer({ name: 'slack', version: '1.0.0' }, { capabilities: {} });

  server.tool(
    'send_message',
    'Send a message to a Slack channel',
    {
      channel_id: z.string().describe('Channel ID to send the message to'),
      text: z.string().describe('Message text'),
      thread_ts: z.string().optional().describe('Thread timestamp to reply to'),
      unfurl_links: z.boolean().optional().describe('Whether to unfurl links in the message'),
    },
    async ({ channel_id, text, thread_ts }) => {
      const ts = `${Math.floor(Date.now() / 1000)}.000001`;
      const channel = channels.find((c) => c.id === channel_id);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              ok: true,
              channel: channel_id,
              channel_name: channel?.name ?? 'unknown',
              ts,
              thread_ts: thread_ts ?? null,
              message: { text, ts, user: 'U000' },
            }),
          },
        ],
      };
    }
  );

  server.tool(
    'search_messages',
    'Search for messages across Slack workspace',
    {
      query: z.string().describe("Search query e.g. 'deployment failed'"),
      sort: z.enum(['score', 'timestamp']).optional().describe('Sort order for results'),
      sort_dir: z.enum(['asc', 'desc']).optional().describe('Sort direction'),
      count: z.number().optional().describe('Number of results, default 20'),
      page: z.number().optional().describe('Page number for pagination'),
      highlight: z.boolean().optional().describe('Whether to highlight matching terms'),
    },
    async ({ query }) => {
      const lowerQuery = query.toLowerCase();
      let matches = incidentMessages;

      if (lowerQuery.includes('dashboard')) {
        matches = incidentMessages.filter(
          (m) =>
            m.text.toLowerCase().includes('dashboard') ||
            m.text.toLowerCase().includes('upstream') ||
            m.text.toLowerCase().includes('flag') ||
            m.text.toLowerCase().includes('scaling')
        );
      } else {
        matches = incidentMessages.filter((m) => m.text.toLowerCase().includes(lowerQuery));
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              ok: true,
              query,
              messages: {
                total: matches.length,
                matches: matches.map((m) => ({
                  ts: m.ts,
                  text: m.text,
                  user: m.user,
                  username: getUserName(m.user),
                  channel: { id: m.channel, name: channels.find((c) => c.id === m.channel)?.name },
                })),
              },
            }),
          },
        ],
      };
    }
  );

  server.tool(
    'list_channels',
    'List channels in the Slack workspace',
    {
      exclude_archived: z.boolean().optional().describe('Exclude archived channels'),
      types: z
        .array(z.enum(['public_channel', 'private_channel', 'mpim', 'im']))
        .optional()
        .describe('Channel types to include'),
      limit: z.number().optional().describe('Maximum number of channels to return'),
      cursor: z.string().optional().describe('Pagination cursor'),
      team_id: z.string().optional().describe('Team ID to filter by'),
    },
    async ({ exclude_archived }) => {
      let result = channels;
      if (exclude_archived) {
        result = result.filter((c) => !c.is_archived);
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              ok: true,
              channels: result.map((c) => ({
                id: c.id,
                name: c.name,
                is_archived: c.is_archived,
                topic: { value: c.topic },
                num_members: c.num_members,
              })),
              response_metadata: { next_cursor: '' },
            }),
          },
        ],
      };
    }
  );

  server.tool(
    'get_channel_history',
    'Get message history from a Slack channel',
    {
      channel_id: z.string().describe('Channel ID to fetch history from'),
      latest: z.string().optional().describe('End of time range, Unix timestamp'),
      oldest: z.string().optional().describe('Start of time range, Unix timestamp'),
      limit: z.number().optional().describe('Maximum number of messages to return'),
      inclusive: z
        .boolean()
        .optional()
        .describe('Include messages with oldest or latest timestamps'),
    },
    async ({ channel_id, latest, oldest, limit }) => {
      let messages = incidentMessages.filter((m) => m.channel === channel_id);

      if (oldest) {
        messages = messages.filter((m) => parseFloat(m.ts) >= parseFloat(oldest));
      }
      if (latest) {
        messages = messages.filter((m) => parseFloat(m.ts) <= parseFloat(latest));
      }
      if (limit) {
        messages = messages.slice(0, limit);
      }

      const channel = channels.find((c) => c.id === channel_id);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              ok: true,
              channel: channel_id,
              channel_name: channel?.name ?? 'unknown',
              messages: messages.map((m) => ({
                ts: m.ts,
                user: m.user,
                username: getUserName(m.user),
                text: m.text,
              })),
              has_more: false,
            }),
          },
        ],
      };
    }
  );

  server.tool(
    'list_users',
    'List users in the Slack workspace',
    {
      limit: z.number().optional().describe('Maximum number of users to return'),
      cursor: z.string().optional().describe('Pagination cursor'),
      team_id: z.string().optional().describe('Team ID to filter by'),
    },
    async ({ limit }) => {
      let result = users;
      if (limit) {
        result = result.slice(0, limit);
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              ok: true,
              members: result.map((u) => ({
                id: u.id,
                name: u.name,
                real_name: u.real_name,
                is_bot: u.is_bot,
                profile: {
                  email: u.email,
                  title: u.title,
                  status_text: u.status_text,
                },
              })),
              response_metadata: { next_cursor: '' },
            }),
          },
        ],
      };
    }
  );

  server.tool(
    'get_user_info',
    'Get detailed information about a Slack user',
    {
      user_id: z.string().describe('User ID to look up'),
    },
    async ({ user_id }) => {
      const user = users.find((u) => u.id === user_id);

      if (!user) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ ok: false, error: 'user_not_found' }),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              ok: true,
              user: {
                id: user.id,
                name: user.name,
                real_name: user.real_name,
                is_bot: user.is_bot,
                profile: {
                  email: user.email,
                  title: user.title,
                  status_text: user.status_text,
                  display_name: user.name,
                },
                tz: 'America/Los_Angeles',
                updated: 1711000000,
              },
            }),
          },
        ],
      };
    }
  );

  server.tool(
    'set_topic',
    'Set the topic for a Slack channel',
    {
      channel_id: z.string().describe('Channel ID to set the topic for'),
      topic: z.string().describe('New channel topic'),
    },
    async ({ channel_id, topic }) => {
      const channel = channels.find((c) => c.id === channel_id);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              ok: true,
              channel: {
                id: channel_id,
                name: channel?.name ?? 'unknown',
                topic: { value: topic, creator: 'U000', last_set: Math.floor(Date.now() / 1000) },
              },
            }),
          },
        ],
      };
    }
  );

  server.tool(
    'add_reaction',
    'Add an emoji reaction to a message',
    {
      channel_id: z.string().describe('Channel where the message is'),
      timestamp: z.string().describe('Message timestamp'),
      name: z.string().describe('Emoji name without colons'),
    },
    async ({ channel_id, timestamp, name }) => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            ok: true,
            channel: channel_id,
            timestamp,
            reaction: name,
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
    const port = portIdx !== -1 ? parseInt(args[portIdx + 1]!, 10) : 3005;
    serveHttp(createServer, port, 'slack');
  } else {
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

main().catch((err) => {
  process.stderr.write(`slack error: ${err}\n`);
  process.exit(1);
});
