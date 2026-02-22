# Iteration 5: Advanced

## Goal

Add full Streamable HTTP transport support for upstream servers, optional HTTP listener on the daemon, config merging from Claude Desktop, and protocol version negotiation.

## Prerequisites

Iteration 4 (robustness) complete.

## Steps

### 1. Streamable HTTP transport for upstream servers

Update `src/core/server-manager.ts`:
- Use `StreamableHTTPClientTransport` from SDK for servers with `url` config
- Auto-detect transport type from config: `command` → stdio, `url` → Streamable HTTP (default) or legacy SSE
- The transport handles:
  - POST for all client→server messages (requests, notifications, responses to server requests)
  - GET to open SSE stream for server→client messages
  - `MCP-Session-Id` header: auto-detected from server response, stored and sent on all subsequent requests
  - `MCP-Protocol-Version` header: sent on all HTTP requests after initialization
  - Resumability: event IDs on SSE events + `Last-Event-ID` header on reconnection for redelivery
  - SSE polling: server may close the connection at will; client reconnects with `Last-Event-ID`
- Pass constructor options:
  - `url`: from config
  - `requestInit`: include custom headers from config (e.g., `Authorization`)
  - `reconnectionOptions`: `{ maxDelay, initialDelay, growFactor, maxRetries }` from config
  - `sessionId`: optional existing session ID from config for reconnection
- Backward compatibility: if `transport: "sse"` is specified in config, use legacy `SSEClientTransport` from SDK

Update `src/core/types.ts`:
```typescript
type HttpServerConfig = {
  url: string;
  transport?: 'streamable-http' | 'sse';  // default: 'streamable-http'
  headers?: Record<string, string>;
  sessionId?: string;                       // for reconnection to existing session
  reconnection?: {
    maxDelay?: number;        // default: 30000ms
    initialDelay?: number;    // default: 1000ms
    growFactor?: number;      // default: 1.5
    maxRetries?: number;      // default: 2
  };
};
```

### 2. Optional HTTP listener on daemon

Add `src/daemon/http-server.ts`:
- Plain `http.createServer` listening on configurable port
- Accept JSON-RPC requests via HTTP POST (same handler as Unix socket)
- Useful for remote access or container deployments
- Origin header validation for DNS rebinding protection: reject requests from unexpected origins
- Note: this is muxed's internal API, not a full MCP endpoint. A full MCP proxy mode (Streamable HTTP server exposing aggregated capabilities) could be a future enhancement.

Update config:
```json
{
  "daemon": {
    "http": {
      "enabled": false,
      "port": 3100,
      "host": "127.0.0.1"
    }
  }
}
```

### 3. Config merging from Claude Desktop

Update `src/core/config.ts`:
- Optionally read `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
- Merge `mcpServers` from Claude Desktop config with muxed's own config
- muxed config takes precedence on conflicts
- Add `--merge-claude-config` flag or config option

### 4. Protocol version negotiation

- muxed requests `2025-11-25` as `protocolVersion` during `initialize`
- The SDK handles version negotiation: if the server only supports an older version, the SDK negotiates downgrade
- Log the negotiated protocol version per server
- Store negotiated version in server status (visible via `muxed status` and `muxed servers`)
- If a server negotiates an older version, some features may be unavailable (e.g., tasks, structuredContent). muxed should check the negotiated version before attempting to use newer features and fail gracefully.

## Verification

1. Configure a Streamable HTTP MCP server in config → `muxed tools` lists its tools
2. Verify `MCP-Session-Id` is stored and reused across requests (check logs)
3. Verify `MCP-Protocol-Version` header is sent on all HTTP requests after init
4. Test SSE stream reconnection with `Last-Event-ID` for resumability
5. Configure a legacy SSE server with `transport: "sse"` → still connects and works
6. Enable HTTP listener → `curl -X POST http://localhost:3100 -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'` returns tools
7. Test Origin header validation on HTTP listener
8. Add servers in Claude Desktop config → `muxed servers` shows merged list
9. Connect to server supporting only older protocol version → graceful degradation, version shown in status
10. `pnpm test` passes
