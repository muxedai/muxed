import http from 'node:http';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

/**
 * Start an HTTP server that creates a fresh McpServer + transport per request.
 * This is required because McpServer.connect() can only be called once per instance.
 */
export function serveHttp(
  createServer: () => McpServer,
  port: number,
  serverName: string
): http.Server {
  const httpServer = http.createServer(async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    const server = createServer();
    await server.connect(transport);
    await transport.handleRequest(req, res);
  });

  httpServer.listen(port, () => {
    process.stderr.write(`${serverName} listening on port ${port}\n`);
  });

  return httpServer;
}
