# Iteration 5: Advanced

## Goal

Add HTTP transport support for upstream servers, optional HTTP listener on the daemon, and config merging from Claude Desktop.

## Prerequisites

Iteration 4 (robustness) complete.

## Steps

### 1. HTTP transport for upstream servers

Update `src/core/server-manager.ts`:
- Support `StreamableHTTPClientTransport` from SDK for servers with `url` config
- Auto-detect transport type from config: `command` → stdio, `url` → HTTP
- Handle HTTP-specific concerns: authentication headers, reconnection on network errors

Update `src/core/types.ts`:
- `HttpServerConfig`: `{ url, transport?, headers? }`

### 2. Optional HTTP listener on daemon

Add `src/daemon/http-server.ts`:
- Express or plain `http.createServer` listening on configurable port
- Accept JSON-RPC requests via HTTP POST
- Same handler as Unix socket
- Useful for remote access or container deployments

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
- Merge `mcpServers` from Claude Desktop config with mcpd's own config
- mcpd config takes precedence on conflicts
- Add `--merge-claude-config` flag or config option

## Verification

1. Configure an HTTP MCP server in config → `mcpd tools` lists its tools
2. Enable HTTP listener → `curl -X POST http://localhost:3100 -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' ` returns tools
3. Add servers in Claude Desktop config → `mcpd servers` shows merged list
4. `pnpm test` passes
