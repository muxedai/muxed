import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { serveHttp } from './serve-http.ts';
import { z } from 'zod/v4';
import { generateTools } from '../cases/tool-accuracy/clusters.ts';

function parseArgs(): { toolCount: number; seed: number } {
  const args = process.argv.slice(2);
  let toolCount = 10;
  let seed = 42;

  const tcIdx = args.indexOf('--tool-count');
  if (tcIdx !== -1 && args[tcIdx + 1]) {
    toolCount = parseInt(args[tcIdx + 1]!, 10);
  }

  const seedIdx = args.indexOf('--seed');
  if (seedIdx !== -1 && args[seedIdx + 1]) {
    seed = parseInt(args[seedIdx + 1]!, 10);
  }

  return { toolCount, seed };
}

function zodTypeFromString(type: string): z.ZodType {
  switch (type) {
    case 'number':
      return z.number();
    case 'boolean':
      return z.boolean();
    default:
      return z.string();
  }
}

function createServer(toolCount: number, seed: number): McpServer {
  const server = new McpServer({ name: 'confusable', version: '1.0.0' }, { capabilities: {} });

  const tools = generateTools(toolCount, seed);

  for (const tool of tools) {
    const schemaObj: Record<string, z.ZodType> = {};
    for (const param of tool.parameters) {
      schemaObj[param.name] = zodTypeFromString(param.type).describe(param.description);
    }

    server.tool(tool.name, tool.description, schemaObj, async (args) => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            tool: tool.name,
            cluster: tool.cluster,
            received_args: args,
            result: `Successfully executed ${tool.name}`,
            data: {
              items: [
                { id: '1', value: `Result from ${tool.name}` },
                { id: '2', value: `Another result from ${tool.name}` },
              ],
            },
          }),
        },
      ],
    }));
  }

  return server;
}

async function main() {
  const { toolCount, seed } = parseArgs();
  const args = process.argv.slice(2);

  if (args.includes('--http')) {
    const portIdx = args.indexOf('--port');
    const port = portIdx !== -1 ? parseInt(args[portIdx + 1]!, 10) : 3004;
    serveHttp(() => createServer(toolCount, seed), port, 'confusable');
    process.stderr.write(`(${toolCount} tools, seed=${seed})\n`);
  } else {
    const server = createServer(toolCount, seed);
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

main().catch((err) => {
  process.stderr.write(`confusable error: ${err}\n`);
  process.exit(1);
});
