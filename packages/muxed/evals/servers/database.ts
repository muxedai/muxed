import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { serveHttp } from './serve-http.ts';
import { z } from 'zod/v4';

function createServer(): McpServer {
  const server = new McpServer({ name: 'database', version: '1.0.0' }, { capabilities: {} });

  server.tool(
    'query',
    'Run a read-only SQL query against the database',
    {
      sql: z.string().describe('SQL query to execute'),
      params: z.array(z.unknown()).optional().describe('Query parameters'),
    },
    async ({ sql }) => {
      const lowerSql = sql.toLowerCase();
      let rows: unknown[];

      if (lowerSql.includes('dashboard') || lowerSql.includes('error')) {
        rows = [
          {
            id: 1,
            dashboard_id: 'dash-1',
            user_id: 'user-42',
            error_type: 'api_timeout',
            count: 45,
            last_seen: '2026-03-21T08:15:00Z',
          },
          {
            id: 2,
            dashboard_id: 'dash-1',
            user_id: 'user-99',
            error_type: 'service_unavailable',
            count: 120,
            last_seen: '2026-03-21T08:14:00Z',
          },
        ];
      } else if (lowerSql.includes('user')) {
        rows = [
          { user_id: 'user-42', email: 'alice@example.com', plan: 'enterprise' },
          { user_id: 'user-99', email: 'bob@example.com', plan: 'pro' },
        ];
      } else {
        rows = [{ result: 'Query executed successfully', rows_affected: 0 }];
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ rows, row_count: rows.length }),
          },
        ],
      };
    }
  );

  server.tool('list_tables', 'List all available database tables', {}, async () => ({
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          tables: [
            { name: 'users', row_count: 15420 },
            { name: 'events', row_count: 2450000 },
            { name: 'dashboard_errors', row_count: 8920 },
            { name: 'sessions', row_count: 342000 },
            { name: 'feature_flag_evaluations', row_count: 1200000 },
          ],
        }),
      },
    ],
  }));

  server.tool(
    'describe_table',
    'Get the schema definition for a specific database table',
    {
      table_name: z.string().describe('Table name'),
    },
    async ({ table_name }) => {
      const schemas: Record<string, unknown[]> = {
        users: [
          { column: 'user_id', type: 'varchar', nullable: false },
          { column: 'email', type: 'varchar', nullable: false },
          { column: 'plan', type: 'varchar', nullable: true },
          { column: 'created_at', type: 'timestamp', nullable: false },
        ],
        dashboard_errors: [
          { column: 'id', type: 'bigint', nullable: false },
          { column: 'dashboard_id', type: 'varchar', nullable: false },
          { column: 'user_id', type: 'varchar', nullable: false },
          { column: 'error_type', type: 'varchar', nullable: false },
          { column: 'count', type: 'integer', nullable: false },
          { column: 'last_seen', type: 'timestamp', nullable: false },
        ],
        events: [
          { column: 'event_id', type: 'bigint', nullable: false },
          { column: 'event_name', type: 'varchar', nullable: false },
          { column: 'user_id', type: 'varchar', nullable: false },
          { column: 'timestamp', type: 'timestamp', nullable: false },
          { column: 'properties', type: 'jsonb', nullable: true },
        ],
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              table: table_name,
              columns: schemas[table_name] ?? [{ column: 'id', type: 'bigint', nullable: false }],
            }),
          },
        ],
      };
    }
  );

  return server;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--http')) {
    const portIdx = args.indexOf('--port');
    const port = portIdx !== -1 ? parseInt(args[portIdx + 1]!, 10) : 3003;
    serveHttp(createServer, port, 'database');
  } else {
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

main().catch((err) => {
  process.stderr.write(`database error: ${err}\n`);
  process.exit(1);
});
