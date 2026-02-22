import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ensureDaemon, sendRequest } from '../client/socket.js';
import type { ServerState } from '../core/types.js';
import { buildInstructions } from './prompts/muxed.js';

export async function startMcpProxy(configPath?: string): Promise<void> {
  await ensureDaemon(configPath);

  const servers = (await sendRequest('servers/list')) as ServerState[];
  const instructions = buildInstructions(servers);

  const server = new McpServer(
    { name: 'muxed', version: '0.1.0' },
    { capabilities: {}, instructions }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
