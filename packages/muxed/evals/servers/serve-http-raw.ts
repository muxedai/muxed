import http from 'node:http';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

/**
 * Start an HTTP server using the low-level Server class (not McpServer).
 * Creates a fresh Server + transport per request since Server.connect() is one-shot.
 */
export function serveHttpRaw(
  createServer: () => Server,
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
