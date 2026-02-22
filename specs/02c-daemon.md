# Iteration 2c: Daemon (Socket Server, Daemonization, Entry Point)

## Goal

Implement the background daemon process: a Unix domain socket JSON-RPC server that hosts the ServerPool, supports lazy start via daemonization, and auto-exits after idle timeout.

## Prerequisites

Iteration 2b (MCP connection) complete.

## Steps

### 1. Daemon server (`src/daemon/server.ts`)

Unix domain socket JSON-RPC server. Accepts connections from CLI clients.

**`createDaemonServer(serverPool: ServerPool, config: McpdConfig): net.Server`**

- `net.createServer()` listening on `getSocketPath()`
- Remove stale socket file before listening (if exists)
- Each client connection:
  - Buffer incoming data, split on newlines
  - Parse each line as a JSON-RPC 2.0 request
  - Dispatch to handler based on `method`
  - Send JSON-RPC response back (JSON + newline)
  - Handle parse errors with JSON-RPC error response (`-32700`)
  - Handle unknown methods with JSON-RPC error response (`-32601`)

**Idle timer:**
- Reset a timer on each incoming request
- After `config.daemon.idleTimeout` ms with no requests, call `shutdown()`
- Expose `resetIdleTimer()` and `shutdown()` methods

**Supported JSON-RPC methods:**

`servers/list` → `serverPool.listServers()`
- Returns array of `ServerState` objects (name, status, serverInfo with title/description/icons, capabilities, protocolVersion)

`tools/list` → `serverPool.listAllTools(params?.server)`
- Optional `server` param to filter
- Returns array of `{ server, tool }` objects with full Tool metadata

`tools/call` → find tool via `serverPool.findTool(params.name)`, then `manager.callTool()`
- Params: `{ name: string, arguments?: object }`
- Returns full `CallToolResult` with all content types and structuredContent
- Return JSON-RPC error if tool not found (`-32602`)

`tools/info` → find tool via `serverPool.findTool(params.name)`
- Returns the full `Tool` object (inputSchema, outputSchema, annotations, execution, icons)
- Return JSON-RPC error if tool not found (`-32602`)

`daemon/status`
- Returns: `{ pid, uptime, serverCount, servers: ServerState[] }`

`daemon/stop`
- Trigger graceful shutdown, respond with `{ ok: true }` before exiting

### 2. Daemon process (`src/daemon/process.ts`)

Handles spawning and managing the daemon as a background process.

**`daemonize(configPath?: string): Promise<void>`**
- Fork current process using `child_process.fork()` with `detached: true`, `stdio: 'ignore'`
- Pass daemon mode flag (e.g., `--daemon`) and optional config path as args
- Parent: wait for IPC "ready" message from child (with timeout), then resolve
- Child: runs daemon entry point (see step 3)
- Write child PID to `getPidPath()`
- Unref the child so parent can exit

**`isDaemonRunning(): Promise<boolean>`**
- Read PID from `getPidPath()`
- If no PID file, return false
- Send signal 0 to check if process exists (`process.kill(pid, 0)`)
- If process exists, try connecting to socket to verify it's responsive
- Return true if both checks pass

**`cleanupStaleFiles(): Promise<void>`**
- If PID file exists but process is dead: remove PID file and socket file
- If socket file exists but no PID file: remove socket file

**`getDaemonPid(): number | null`**
- Read and parse PID file, return null if missing or invalid

### 3. Daemon entry point (`src/daemon/index.ts`)

The entry point when the process runs in daemon mode.

**`startDaemon(configPath?: string): Promise<void>`**

1. Load config via `loadConfig(configPath)`
2. Ensure toold directory exists via `ensureMcpdDir()`
3. Create `ServerPool`, call `connectAll(config)`
4. Create daemon server via `createDaemonServer(serverPool, config)`
5. Start listening on socket
6. Write PID file
7. If started via fork: send IPC "ready" message to parent via `process.send()`
8. Set up idle timeout
9. Handle `SIGTERM`: stop accepting connections, disconnect all servers, remove socket + PID files, exit

**Main entry integration (`src/cli.ts`):**
- Check for `--daemon` flag in `process.argv`
- If present: call `startDaemon()` instead of CLI
- Otherwise: proceed with CLI (next iteration)

## Verification

1. `pnpm type-check` passes
2. `pnpm build` succeeds
3. Manual test: start daemon directly with `node bin/cli.mjs --daemon`
   - Verify socket file created at `~/.toold/toold.sock`
   - Verify PID file created at `~/.toold/toold.pid`
4. Manual test: send JSON-RPC request to socket (using `nc` or a test script):
   ```
   echo '{"jsonrpc":"2.0","id":1,"method":"servers/list","params":{}}' | nc -U ~/.toold/toold.sock
   ```
   - Verify response contains server list
5. Manual test: send `tools/list` → verify tools returned
6. Manual test: send `tools/call` with echo tool → verify result
7. Manual test: send `daemon/stop` → daemon exits, socket + PID files removed
8. Manual test: daemon auto-exits after idle timeout (set to short value like 5s for testing)
9. Unit test: `isDaemonRunning()` returns false when no daemon
10. Unit test: `cleanupStaleFiles()` removes stale socket/PID
11. Integration test: `daemonize()` spawns daemon, PID file written, socket becomes available
12. `pnpm test` passes
