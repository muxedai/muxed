# Iteration 4: Robustness

## Goal

Make the daemon production-ready with health checking, auto-restart, graceful shutdown, structured logging, error recovery, task cleanup, and Streamable HTTP resilience.

## Prerequisites

Iteration 3 (complete CLI) complete.

## Steps

### 1. Health checking (`src/core/server-manager.ts`)

- Periodic `client.ping()` calls (configurable interval, default 30s)
- Track consecutive failures
- Mark server as `error` after N failed pings
- Emit health status changes for logging

### 2. Auto-restart of crashed MCP servers

- Detect server process exit via `transport.onclose`
- Implement exponential backoff reconnection: 1s, 2s, 4s, 8s, 16s, max 60s
- Reset backoff on successful reconnection
- Cap maximum restart attempts (configurable, default unlimited)
- Log each restart attempt

### 3. Graceful shutdown (`src/daemon/index.ts`)

- Handle SIGTERM and SIGINT signals
- Stop accepting new connections on Unix socket
- Wait for in-flight requests to complete (with timeout)
- Disconnect all MCP servers gracefully (`client.close()`)
- Kill child processes
- Remove socket file and PID file
- Exit cleanly

### 4. Logger (`src/utils/logger.ts`)

- Structured logging with levels: debug, info, warn, error
- Write to stderr (foreground mode) and log file (`~/.toold/toold.log`)
- Include timestamp, level, server name (when relevant)
- Log rotation: truncate when file exceeds 10MB
- Configurable log level
- Log progress notification `message` fields when available (for debugging long-running operations)

### 5. Stale daemon detection

Improve `src/daemon/process.ts`:

- On startup, check for stale socket files (socket exists but no process at PID)
- Verify PID is actually an toold process (check process name or command)
- Clean up and proceed if stale
- Handle race conditions (lock file during startup)

### 6. Request timeout handling

- Per-request timeout in daemon (default 60s, configurable)
- CLI `--timeout` flag overrides per-call
- Clean timeout error messages
- Kill long-running tool calls if client disconnects
- For task-augmented requests: the initial `callTool` returns quickly with a `CreateTaskResult`. Timeout applies to the blocking poll phase in non-async mode.
- Option `resetTimeoutOnProgress: true` for blocking calls where progress notifications arrive (progress `message` field indicates active work)
- `maxTotalTimeout` caps the total wait time regardless of progress updates

### 7. Connection error resilience

- If all servers fail to connect on startup, daemon stays running (not all servers may be available immediately)
- Retry failed servers in background
- `status` command shows per-server error details

### 8. Task cleanup on server disconnect

- When a server disconnects or crashes, mark any tracked tasks for that server as unreachable
- On reconnection, re-query task status if the server maintains task state
- Tasks are server-side state – if the server loses state on restart, tasks are lost. Report this to CLI callers.
- Clean up stale task references after a configurable expiry period

### 9. Streamable HTTP transport resilience

For HTTP-connected upstream servers:

- Handle connection drops: `StreamableHTTPClientTransport` has built-in reconnection
- Session management: store `MCP-Session-Id` assigned by the server, include in subsequent requests
- If session expires (server returns HTTP 404 for the session), re-initialize the connection from scratch
- SSE stream reconnection: use `Last-Event-ID` header for resumability and redelivery of missed events
- Log session lifecycle events (created, resumed, expired, re-initialized)

## Verification

1. Kill an MCP server process → daemon detects and auto-restarts it
2. `node bin/cli.mjs status` → shows health status per server
3. Send SIGTERM to daemon → shuts down cleanly, socket + PID removed
4. Start daemon with a misconfigured server → other servers still work, error shown in status
5. Check `~/.toold/toold.log` → structured log entries with progress messages
6. Start daemon twice → second instance detects first and reports it
7. Kill daemon ungracefully (`kill -9`) → next CLI command cleans up stale files and starts fresh
8. Kill server mid-task → `toold task <id>` reports task as unreachable
9. Test HTTP server reconnection → session ID preserved across reconnects
10. `pnpm test` passes
