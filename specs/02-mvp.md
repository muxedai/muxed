# Iteration 2: MVP

## Goal

Implement the core daemon + CLI architecture with lazy start, and the essential commands: `servers`, `tools`, `call`, `info`, `stop`, `status`.

## Prerequisites

Iteration 1 (project setup) complete.

## Steps

### 1. Core types (`src/core/types.ts`)

Define shared types:
- `StdioServerConfig`: `{ command, args, env?, cwd? }`
- `HttpServerConfig`: `{ url, transport }`
- `ServerConfig`: union of above
- `McpdConfig`: `{ mcpServers: Record<string, ServerConfig>, daemon?: DaemonConfig }`
- `DaemonConfig`: `{ idleTimeout, connectTimeout, requestTimeout }`
- `ServerStatus`: `'connecting' | 'connected' | 'error' | 'closed'`

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
- `connect()`: create `StdioClientTransport` + SDK `Client`, perform handshake
- `disconnect()`: close client and transport
- `listTools()`: return cached tools (refreshed on connect and `listChanged`)
- `callTool(name, args, timeout?)`: delegate to `client.callTool()`
- `getStatus()`: return current connection status
- Handle `transport.onclose` for cleanup

### 5. Server Pool (`src/core/server-pool.ts`)

Manages all `ServerManager` instances:
- `connectAll(config)`: create and connect all servers in parallel
- `disconnectAll()`: close all connections
- `getServer(name)`: get a specific server manager
- `listServers()`: return all servers with status
- `listAllTools()`: aggregate tools from all servers with `server/tool` naming
- `findTool(serverTool)`: parse `server/tool` string, find the right manager and tool

### 6. Daemon server (`src/daemon/server.ts`)

Unix domain socket JSON-RPC server:
- `net.createServer()` listening on socket path
- Parse incoming newline-delimited JSON-RPC requests
- Dispatch to handler based on method name
- Send JSON-RPC responses back
- Track idle timer: reset on each request, shutdown after `idleTimeout`

Supported methods:
- `servers/list` → `serverPool.listServers()`
- `tools/list` → `serverPool.listAllTools()` (with optional server filter)
- `tools/call` → `serverPool.findTool()` then `manager.callTool()`
- `tools/info` → find tool, return its schema
- `daemon/status` → return PID, uptime, server count
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

- Format server list as table
- Format tool list as table
- Format tool info with schema
- Format tool call results
- Support `--json` flag (just `JSON.stringify`)

### 11. CLI commands

Each command in `src/cli/commands/`:

**`servers.ts`**: list servers with status
**`tools.ts`**: list tools, optional server filter
**`info.ts`**: show tool schema by `server/tool`
**`call.ts`**: call tool with JSON args (or `-` for stdin)
**`stop.ts`**: send `daemon/stop` to daemon
**`status.ts`**: show daemon status

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
3. `node bin/cli.mjs servers` → auto-starts daemon, shows "everything" as connected
4. `node bin/cli.mjs tools` → lists tools from the everything server
5. `node bin/cli.mjs info everything/echo` → shows echo tool schema
6. `node bin/cli.mjs call everything/echo '{"message":"hello"}'` → returns result
7. `node bin/cli.mjs status` → shows daemon running
8. `node bin/cli.mjs stop` → daemon shuts down
9. `pnpm type-check` passes
