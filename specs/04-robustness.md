# Iteration 4: Robustness

## Goal

Make the daemon production-ready with health checking, auto-restart, graceful shutdown, structured logging, and error recovery.

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
- Write to stderr (foreground mode) and log file (`~/.mcpd/mcpd.log`)
- Include timestamp, level, server name (when relevant)
- Log rotation: truncate when file exceeds 10MB
- Configurable log level

### 5. Stale daemon detection

Improve `src/daemon/process.ts`:
- On startup, check for stale socket files (socket exists but no process at PID)
- Verify PID is actually an mcpd process (check process name or command)
- Clean up and proceed if stale
- Handle race conditions (lock file during startup)

### 6. Request timeout handling

- Per-request timeout in daemon (default 60s, configurable)
- CLI `--timeout` flag overrides per-call
- Clean timeout error messages
- Kill long-running tool calls if client disconnects

### 7. Connection error resilience

- If all servers fail to connect on startup, daemon stays running (not all servers may be available immediately)
- Retry failed servers in background
- `status` command shows per-server error details

## Verification

1. Kill an MCP server process → daemon detects and auto-restarts it
2. `node bin/cli.mjs status` → shows health status per server
3. Send SIGTERM to daemon → shuts down cleanly, socket + PID removed
4. Start daemon with a misconfigured server → other servers still work, error shown in status
5. Check `~/.mcpd/mcpd.log` → structured log entries
6. Start daemon twice → second instance detects first and reports it
7. Kill daemon ungracefully (`kill -9`) → next CLI command cleans up stale files and starts fresh
8. `pnpm test` passes
