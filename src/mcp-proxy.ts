import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ensureDaemon, sendRequest } from './client/socket.js';
import type { ServerState } from './core/types.js';
import type { Tool, Resource, Prompt } from '@modelcontextprotocol/sdk/types.js';

type ToolEntry = { server: string; tool: Tool };
type ResourceEntry = { server: string; resource: Resource };
type PromptEntry = { server: string; prompt: Prompt };

function buildInstructions(servers: ServerState[]): string | undefined {
  const parts: string[] = [];

  for (const s of servers) {
    if (s.status !== 'connected' || !s.instructions) continue;
    parts.push(`[${s.name}]\n${s.instructions}`);
  }

  return parts.length > 0 ? parts.join('\n\n') : undefined;
}

export async function startMcpProxy(configPath?: string): Promise<void> {
  // Ensure daemon is running
  await ensureDaemon(configPath);

  // Fetch initial state from daemon
  const servers = (await sendRequest('servers/list')) as ServerState[];

  const hasTools = servers.some((s) => s.status === 'connected' && s.capabilities?.tools);
  const hasResources = servers.some((s) => s.status === 'connected' && s.capabilities?.resources);
  const hasPrompts = servers.some((s) => s.status === 'connected' && s.capabilities?.prompts);
  const instructions = buildInstructions(servers);

  const server = new Server(
    { name: 'mcpd', version: '0.1.0' },
    {
      capabilities: {
        ...(hasTools ? { tools: {} } : {}),
        ...(hasResources ? { resources: {} } : {}),
        ...(hasPrompts ? { prompts: {} } : {}),
      },
      instructions,
    }
  );

  // --- Tools ---

  server.setRequestHandler(ListToolsRequestSchema, async (request) => {
    const tools = (await sendRequest('tools/list')) as ToolEntry[];
    return {
      tools: tools.map(({ server: serverName, tool }) => ({
        ...tool,
        name: `${serverName}/${tool.name}`,
      })),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const result = await sendRequest('tools/call', {
      name,
      arguments: args ?? {},
    });
    return result as { content: Array<{ type: string; text?: string }> };
  });

  // --- Resources ---

  server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
    const resources = (await sendRequest('resources/list')) as ResourceEntry[];
    return {
      resources: resources.map(({ server: serverName, resource }) => ({
        ...resource,
        name: resource.name ? `${serverName}/${resource.name}` : resource.name,
      })),
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    // Find which server owns this resource
    const resources = (await sendRequest('resources/list')) as ResourceEntry[];
    const match = resources.find((r) => r.resource.uri === uri);
    if (!match) {
      throw new Error(`Resource not found: ${uri}`);
    }

    const result = await sendRequest('resources/read', {
      server: match.server,
      uri,
    });
    return result as { contents: Array<{ uri: string; text?: string; mimeType?: string }> };
  });

  // --- Prompts ---

  server.setRequestHandler(ListPromptsRequestSchema, async (request) => {
    const prompts = (await sendRequest('prompts/list')) as PromptEntry[];
    return {
      prompts: prompts.map(({ server: serverName, prompt }) => ({
        ...prompt,
        name: `${serverName}/${prompt.name}`,
      })),
    };
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const slashIndex = name.indexOf('/');
    if (slashIndex === -1) {
      throw new Error(`Invalid prompt name: ${name}. Expected format: server/prompt`);
    }

    const serverName = name.slice(0, slashIndex);
    const promptName = name.slice(slashIndex + 1);

    const result = await sendRequest('prompts/get', {
      server: serverName,
      name: promptName,
      ...(args ? { arguments: args } : {}),
    });
    return result as { messages: Array<{ role: string; content: { type: string; text: string } }> };
  });

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
