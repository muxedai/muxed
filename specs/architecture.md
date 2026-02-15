# mcpd - MCP Server Proxy/Aggregator CLI

## Context

Coding agents (like Claude Code) need to interact with multiple MCP servers, but managing connections to N servers is complex and slow. `mcpd` aggregates all MCP servers behind a single CLI interface, keeping servers warm via a background daemon. Agents interact with it as `npx mcpd <command>`.

## Architecture: Lazy Daemon + CLI

```
  npx mcpd call server/tool '{}'
  ──────────────────────────────────►  ┌──────────────────────┐
  (Unix socket: ~/.mcpd/mcpd.sock)    │     mcpd daemon      │
                                      │                      │
  npx mcpd tools                      │  ServerManager(fs)   │──► [stdio child: filesystem]
  ──────────────────────────────────►  │  ServerManager(pg)   │──► [stdio child: postgres]
                                      │  ServerManager(...)   │──► [stdio child: ...]
  npx mcpd servers                    │                      │
  ──────────────────────────────────►  └──────────────────────┘
                                       (auto-exits after idle timeout)
```

- **Lazy start**: daemon spawns automatically on first CLI command if not already running. No explicit `start` needed.
- **Idle shutdown**: daemon exits after a configurable idle period (default: 5 min) with no incoming requests
- **Daemon**: long-running Node.js process, manages MCP server connections via `@modelcontextprotocol/sdk`, listens on Unix domain socket
- **CLI**: thin client that connects to socket (spawning daemon first if needed), sends JSON-RPC, formats output, exits
- IPC uses JSON-RPC 2.0 over Unix socket (same framing as MCP stdio transport)

## CLI Commands

| Command | Description |
|---------|-------------|
| `mcpd servers [--json]` | List servers and connection status |
| `mcpd tools [server] [--json]` | List available tools |
| `mcpd info <server/tool> [--json]` | Tool schema details |
| `mcpd call <server/tool> [json\|-] [--timeout ms]` | Invoke a tool |
| `mcpd grep <pattern>` | Search tool names/descriptions |
| `mcpd resources [server] [--json]` | List resources |
| `mcpd read <server/resource>` | Read a resource |
| `mcpd stop` | Stop daemon manually (optional, it auto-exits on idle) |
| `mcpd status` | Daemon status: running/stopped, PID, uptime, servers |
| `mcpd reload` | Reload config, reconnect changed servers |

All commands (except `stop`) auto-start the daemon if not running. Daemon auto-exits after idle timeout (default 5 min).

## Configuration

**File: `mcpd.config.json`** (project-local, then `~/.config/mcpd/config.json`)

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"],
      "env": {}
    },
    "remote": {
      "url": "https://mcp.example.com/",
      "transport": "streamable-http"
    }
  }
}
```

Format is intentionally compatible with `claude_desktop_config.json` `mcpServers` section.

Daemon settings:
```json
{
  "daemon": {
    "idleTimeout": 300000,
    "connectTimeout": 30000,
    "requestTimeout": 60000
  }
}
```

## Project Structure

```
mcpd/
  package.json
  tsconfig.json
  build.config.mjs                # obuild config (single entry: src/cli.ts)
  .prettierrc                     # {semi, singleQuote, trailingComma es5, printWidth 100}
  .husky/pre-commit               # pnpm lint-staged
  bin/cli.mjs                     # CLI entry shim
  specs/                          # design specs
  src/
    cli.ts                        # main entry point (dispatches daemon vs cli)
    cli/
      index.ts                    # commander setup, all subcommands
      commands/
        stop.ts, status.ts, reload.ts
        servers.ts, tools.ts, info.ts, call.ts, grep.ts
        resources.ts, read.ts
      client.ts                   # Unix socket JSON-RPC client
      formatter.ts                # human-readable vs --json output
    daemon/
      index.ts                    # daemon entry point
      server.ts                   # Unix socket JSON-RPC server
      process.ts                  # daemonization (fork, PID file)
    core/
      server-manager.ts           # wraps SDK Client + StdioClientTransport per server
      server-pool.ts              # manages all ServerManagers
      config.ts                   # config loading + Zod validation
      types.ts                    # shared types
    utils/
      paths.ts                    # socket/PID/log file paths
      logger.ts                   # logging
```

## Tooling

```json
{
  "name": "mcpd",
  "version": "0.1.0",
  "type": "module",
  "bin": { "mcpd": "./bin/cli.mjs" },
  "files": ["dist", "bin"],
  "engines": { "node": ">=20" },
  "packageManager": "pnpm@10.17.1",
  "scripts": {
    "build": "obuild",
    "dev": "node src/cli.ts",
    "format": "prettier --write 'src/**/*.ts'",
    "format:check": "prettier --check 'src/**/*.ts'",
    "prepare": "husky",
    "test": "vitest",
    "type-check": "tsc --noEmit"
  },
  "lint-staged": {
    "src/**/*.ts": "prettier --write"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.26.0",
    "commander": "^14.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "husky": "^9.1.7",
    "lint-staged": "^16.2.7",
    "obuild": "^0.4.22",
    "prettier": "^3.8.1",
    "typescript": "^5.9.3",
    "vitest": "^4.0.17"
  }
}
```

**Tooling choices:**
- **pnpm** as package manager
- **obuild** for bundling (single entry point: `src/cli.ts`)
- **Prettier** for formatting (`.prettierrc`: semi, singleQuote, trailingComma es5, printWidth 100)
- **Husky + lint-staged** for pre-commit formatting
- **Vitest** for testing (default config, no vitest.config.ts)
- **TypeScript** with bundler resolution, strict mode, noEmit (type-check only, obuild handles output)
- **bin/cli.mjs** as CLI entry point
- zod not needed as separate dep (comes with `@modelcontextprotocol/sdk`)

## Key Implementation Details

### Server Manager
- Uses SDK's `Client` + `StdioClientTransport` (stdio servers) or `StreamableHTTPClientTransport` (HTTP servers)
- On connect: calls `listTools()`, `listResources()`, `listPrompts()` to build index
- Handles `onclose` → auto-reconnect with exponential backoff
- Periodic `ping()` health checks

### Lazy Start Flow
1. CLI command runs → tries to connect to Unix socket
2. Socket not found → CLI forks a daemon process in background
3. Daemon starts, creates socket, connects to MCP servers, signals ready
4. CLI retries socket connection, sends request
5. Daemon resets idle timer on each request
6. After `idleTimeout` ms with no requests → daemon shuts down, removes socket + PID file

### Daemon IPC Protocol
CLI → daemon uses JSON-RPC 2.0 methods:
- `servers/list`, `tools/list`, `tools/call`, `tools/info`, `tools/grep`
- `resources/list`, `resources/read`, `prompts/list`
- `config/reload`, `daemon/status`

### Error Handling
- Server fails to connect → log, mark as `error`, continue with others
- Daemon not running → auto-start it (lazy start)
- Stale PID/socket → detect dead PID, clean up, spawn fresh daemon
- Auto-restart crashed MCP servers with exponential backoff (1s → 60s max)

## Implementation Iterations

1. [Project Setup](./01-project-setup.md) - tooling, deps, Claude Code hooks
2. [MVP](./02-mvp.md) - daemon + CLI core: `servers`, `tools`, `call`, `info`, `stop`, `status`
3. [Complete CLI](./03-complete-cli.md) - `grep`, `resources`, `read`, `reload`, stdin, `--json`
4. [Robustness](./04-robustness.md) - health checks, auto-restart, graceful shutdown, logging
5. [Advanced](./05-advanced.md) - HTTP transport, HTTP listener, Claude Desktop config merge
