# Iteration 2: MVP

## Goal

Implement the core daemon + CLI architecture with lazy start, and the essential commands: `servers`, `tools`, `call`, `info`, `stop`, `status`. Types and data models align with MCP specification `2025-11-25`.

## Prerequisites

Iteration 1 (project setup) complete.

## Steps

### 1. Core types (`src/core/types.ts`)

Import SDK types directly where possible:
```typescript
import type { Tool, Resource, Prompt, Implementation, ServerCapabilities } from '@modelcontextprotocol/sdk/types.js';
```

Define shared config and status types:
- `StdioServerConfig`: `{ command, args, env?, cwd? }`
- `HttpServerConfig`: `{ url, transport?: 'streamable-http' | 'sse', headers?: Record<string, string> }`
- `ServerConfig`: union of above
- `McpdConfig`: `{ mcpServers: Record<string, ServerConfig>, daemon?: DaemonConfig }`
- `DaemonConfig`: `{ idleTimeout, connectTimeout, requestTimeout }`
- `ServerStatus`: `'connecting' | 'connected' | 'error' | 'closed'`
- `ServerInfo`: extends status with `serverInfo: Implementation` (name, version, title, description, icons, websiteUrl), `capabilities: ServerCapabilities`, `protocolVersion: string`, `instructions?: string`

Note: The SDK's `Tool` type already includes `title`, `icons`, `outputSchema`, `annotations` (readOnlyHint, destructiveHint, idempotentHint, openWorldHint), and `execution` (taskSupport). The SDK's `Resource` type includes `title`, `size`, `icons`, `annotations` (audience, priority, lastModified). The SDK's `Prompt` type includes `title`, `icons`. Use these types directly rather than redefining them.

### 2. Config loader (`src/core/config.ts`)

- Search for `mcpd.config.json` in CWD, then `~/.config/mcpd/config.json`
- Validate with Zod schema
- Export `loadConfig(configPath?: string): McpdConfig`

### 3. Paths utility (`src/utils/paths.ts`)

- `getSocketPath()` → `~/.mcpd/mcpd.sock`
- `getPidPath()` → `~/.mcpd/mcpd.pid`
- `getLogPath()` → `~/.mcpd/mcpd.log`
- Ensure `~/.mcpd/` directory exists

### 4. Server Manager (`src/core/server-manager.ts`)

Wraps a single MCP server connection:
- `connect()`: create `StdioClientTransport` (stdio) or `StreamableHTTPClientTransport` (HTTP) + SDK `Client`, perform handshake
  - Pass `Implementation` info: `{ name: 'mcpd', version: '<pkg version>', title: 'mcpd - MCP Proxy/Aggregator' }`
  - Declare client capabilities: `{ tasks: { list: {}, cancel: {} } }` — no `sampling`, `elicitation`, or `roots`
  - Request protocol version `2025-11-25`
  - After handshake, store: `client.getServerCapabilities()`, `client.getServerVersion()` (Implementation with title, description, icons, websiteUrl), `client.getInstructions()`, negotiated `protocolVersion`
- `disconnect()`: close client and transport
- `listTools()`: return full SDK `Tool` objects (including title, icons, outputSchema, annotations, execution). Cache and refresh on connect and `listChanged` notification.
- `callTool(name, args, timeout?)`: delegate to `client.callTool()`. Return full result including `content` (text, image, audio, resource_link, resource) and `structuredContent`.
- `getStatus()`: return current connection status
- `getServerInfo()`: return stored `Implementation` data
- `getCapabilities()`: return stored `ServerCapabilities`
- Handle `transport.onclose` for cleanup

### 5. Server Pool (`src/core/server-pool.ts`)

Manages all `ServerManager` instances:
- `connectAll(config)`: create and connect all servers in parallel
- `disconnectAll()`: close all connections
- `getServer(name)`: get a specific server manager
- `listServers()`: return all servers with status, serverInfo (title, description, icons, websiteUrl), capabilities summary, protocolVersion
- `listAllTools()`: aggregate tools from all servers with `server/tool` naming, preserving full tool metadata (title, icons, outputSchema, annotations, execution)
- `findTool(serverTool)`: parse `server/tool` string, find the right manager and tool

### 6. Daemon server (`src/daemon/server.ts`)

Unix domain socket JSON-RPC server:
- `net.createServer()` listening on socket path
- Parse incoming newline-delimited JSON-RPC requests
- Dispatch to handler based on method name
- Send JSON-RPC responses back
- Track idle timer: reset on each request, shutdown after `idleTimeout`

Supported methods:
- `servers/list` → `serverPool.listServers()` — includes serverInfo (title, description, icons), capabilities, protocolVersion per server
- `tools/list` → `serverPool.listAllTools()` (with optional server filter) — returns full Tool objects with title, icons, outputSchema, annotations, execution
- `tools/call` → `serverPool.findTool()` then `manager.callTool()` — returns full result with all content types (text, image, audio, resource_link, resource) and structuredContent
- `tools/info` → find tool, return its full schema including inputSchema, outputSchema, annotations, execution, icons
- `daemon/status` → return PID, uptime, server count, per-server title/capabilities/protocolVersion
- `daemon/stop` → graceful shutdown

### 7. Daemon process (`src/daemon/process.ts`)

- `daemonize(configPath)`: fork current process detached, write PID file, wait for IPC "ready" signal
- `isDaemonRunning()`: check PID file, verify process exists
- `cleanupStaleFiles()`: remove stale socket + PID if process is dead

### 8. Daemon entry point (`src/daemon/index.ts`)

When run in daemon mode:
1. Load config
2. Create server pool, connect all servers
3. Start Unix socket server
4. Signal "ready" to parent process
5. Set up idle timeout
6. Handle SIGTERM for graceful shutdown

### 9. CLI client (`src/cli/client.ts`)

- `ensureDaemon()`: check if daemon is running, if not spawn it via `daemonize()`
- `sendRequest(method, params)`: connect to Unix socket, send JSON-RPC request, read response
- Handle connection errors with clear messages

### 10. CLI formatter (`src/cli/formatter.ts`)

Format server list as table:
- Show server name, `title` (from serverInfo, if available), status, protocolVersion
- In `--json` mode: include full serverInfo with icons, capabilities

Format tool list as table:
- Show `server/name`, `title` (if present, as display name), description (truncated)
- Show annotation hints as tags: `[read-only]`, `[destructive]`, `[idempotent]`
- In `--json` mode: include full tool objects with icons, outputSchema, annotations, execution

Format tool info with schema:
- Show `title`, `description`
- Show `inputSchema` formatted
- Show `outputSchema` formatted (if present)
- Show `annotations`: readOnlyHint, destructiveHint, idempotentHint, openWorldHint
- Show `execution.taskSupport` if present

Format tool call results:
- `text` content: display directly
- `image` content: show `[Image: mimeType, size bytes]`
- `audio` content: show `[Audio: mimeType, size bytes]`
- `resource_link` content: show `Resource: name (uri)`
- `resource` (embedded) content: show URI and text preview or `[Binary: mimeType, size bytes]`
- `structuredContent`: display as formatted JSON block when present
- All types pass through unchanged in `--json` mode

Support `--json` flag (just `JSON.stringify`)

### 11. CLI commands

Each command in `src/cli/commands/`:

**`servers.ts`**: list servers with status, title, protocolVersion
**`tools.ts`**: list tools with title and annotation tags, optional server filter
**`info.ts`**: show full tool schema by `server/tool` (inputSchema, outputSchema, annotations, execution)
**`call.ts`**: call tool with JSON args (or `-` for stdin), format all content types in result
**`stop.ts`**: send `daemon/stop` to daemon
**`status.ts`**: show daemon status including per-server capabilities

### 12. CLI entry point (`src/cli/index.ts`)

Wire up Commander with all subcommands. Each command calls `ensureDaemon()` first (except `stop`).

### 13. Main entry (`src/cli.ts`)

Import and run the CLI.

## Verification

1. Create `mcpd.config.json` in project root pointing to `@modelcontextprotocol/server-everything`:
   ```json
   {
     "mcpServers": {
       "everything": {
         "command": "npx",
         "args": ["-y", "@modelcontextprotocol/server-everything"]
       }
     }
   }
   ```
2. `pnpm build` succeeds
3. `node bin/cli.mjs servers` → auto-starts daemon, shows "everything" as connected with server title and protocolVersion
4. `node bin/cli.mjs tools` → lists tools from the everything server with titles and annotation tags
5. `node bin/cli.mjs info everything/echo` → shows echo tool schema including inputSchema, outputSchema (if any), annotations
6. `node bin/cli.mjs call everything/echo '{"message":"hello"}'` → returns result with all content types handled
7. `node bin/cli.mjs status` → shows daemon running with per-server capabilities
8. `node bin/cli.mjs stop` → daemon shuts down
9. `pnpm type-check` passes
