import { z } from 'zod/v4';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ensureDaemon, sendRequest } from '../client/socket.js';
import type { ServerState } from '../core/types.js';
import { buildInstructions } from './prompts/muxed.js';
import { handleToolCommand } from './tool-handler.js';

export async function startMcpProxy(options?: {
  configPath?: string;
  proxyTools?: boolean;
}): Promise<void> {
  await ensureDaemon(options?.configPath);

  const servers = (await sendRequest('servers/list')) as ServerState[];
  const mode = options?.proxyTools ? 'tool' : 'cli';
  const instructions = buildInstructions(servers, mode);

  const server = new McpServer(
    { name: 'muxed', version: '0.1.0' },
    { capabilities: {}, instructions }
  );

  if (options?.proxyTools) {
    server.tool(
      'exec',
      'Interact with MCP servers: discover, inspect, and call tools. Commands: servers, tools [server], grep <pattern>, info <server/tool>, call <server/tool>, resources [server], read <server/resource>',
      {
        command: z
          .string()
          .describe(
            "Command to execute, e.g. 'servers', 'tools', 'grep weather', 'info slack/search', 'call slack/search'"
          ),
        input: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("JSON arguments for 'call' command — avoids JSON-in-string escaping"),
      },
      async ({ command, input }) => {
        const result = await handleToolCommand(
          command,
          input as Record<string, unknown> | undefined
        );
        return {
          content: result.content.map((c) => ({
            type: 'text' as const,
            text: c.text,
          })),
          isError: result.isError,
        };
      }
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
