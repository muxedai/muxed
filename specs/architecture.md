# mcpd - MCP Server Proxy/Aggregator CLI

> **Target Protocol**: MCP specification `2025-11-25`

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
                                      │  ServerManager(...)   │──► [Streamable HTTP: remote]
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
| `mcpd servers [--json]` | List servers with connection status, title, capabilities |
| `mcpd tools [server] [--json]` | List available tools (with title, annotations) |
| `mcpd info <server/tool> [--json]` | Tool schema details (inputSchema, outputSchema, annotations) |
| `mcpd call <server/tool> [json\|-] [--timeout ms] [--async]` | Invoke a tool (`--async` for task-based execution) |
| `mcpd grep <pattern>` | Search tool names, titles, and descriptions |
| `mcpd resources [server] [--json]` | List resources (with title, annotations) |
| `mcpd read <server/resource>` | Read a resource |
| `mcpd prompts [server] [--json]` | List prompt templates (with title, icons) |
| `mcpd prompt <server/prompt> [args-json] [--json]` | Get a prompt (render with arguments) |
| `mcpd completions <type> <name> <arg> <value> [--json]` | Argument auto-completions |
| `mcpd tasks [server] [--json]` | List active tasks |
| `mcpd task <taskId> [--json]` | Get task status |
| `mcpd task-result <taskId> [--json]` | Get completed task result |
| `mcpd task-cancel <taskId>` | Cancel a running task |
| `mcpd stop` | Stop daemon manually (optional, it auto-exits on idle) |
| `mcpd status` | Daemon status: running/stopped, PID, uptime, servers, protocol versions |
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
      "url": "https://mcp.example.com/mcp",
      "transport": "streamable-http",
      "headers": { "Authorization": "Bearer ..." }
    }
  }
}
```

Format is intentionally compatible with `claude_desktop_config.json` `mcpServers` section.

- `transport` defaults to `"streamable-http"` for URL-based servers. Legacy `"sse"` is also supported for backward compatibility.
- `headers` allows custom HTTP headers (e.g. auth tokens) for remote servers.

Daemon settings:
```json
{
  "daemon": {
    "idleTimeout": 300000,
    "connectTimeout": 30000,
    "requestTimeout": 60000,
    "http": {
      "enabled": false,
      "port": 3100,
      "host": "127.0.0.1"
    }
  }
}
```

## Capability Negotiation

When mcpd connects to upstream MCP servers as a client, it declares these capabilities during `initialize`:

**Declared (supported):**
- `tasks`: `{ list: {}, cancel: {} }` — mcpd can track and cancel long-running tasks

**Not declared (unsupported):**
- `sampling` — CLI callers cannot perform LLM sampling on behalf of servers
- `elicitation` — CLI callers cannot interactively collect user input
- `roots` — mcpd does not provide filesystem root paths to servers

After handshake, mcpd stores each server's `ServerCapabilities` and `serverInfo` (including `name`, `version`, `title`, `description`, `icons`, `websiteUrl`) and the negotiated `protocolVersion`.

## Features Not Supported

mcpd is a CLI proxy — it cannot relay server-initiated requests back to a non-interactive caller:

1. **Elicitation** (`elicitation/create`): Servers may request user input. mcpd does NOT register an elicitation handler. Tool calls that trigger elicitation will fail with an error indicating the capability is unavailable.

2. **Sampling** (`sampling/createMessage`): Servers may request LLM completions. mcpd does NOT register a sampling handler. Tool calls that require sampling will fail gracefully.

3. **Roots** (`roots/list`): Servers may request filesystem root paths. mcpd does NOT provide roots.

4. **Audio/icon rendering**: mcpd passes audio content and icon metadata through in `--json` output but cannot render them in CLI mode. Audio shows as `[Audio: mimeType, size]`, icons are omitted in human-readable output.

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
        prompts.ts, prompt.ts     # prompt listing and rendering
        completions.ts            # argument auto-completions
        tasks.ts                  # list active tasks
        task.ts                   # get single task status
        task-result.ts            # get completed task result
        task-cancel.ts            # cancel a running task
      client.ts                   # Unix socket JSON-RPC client
      formatter.ts                # human-readable vs --json output
    daemon/
      index.ts                    # daemon entry point
      server.ts                   # Unix socket JSON-RPC server
      process.ts                  # daemonization (fork, PID file)
    core/
      server-manager.ts           # wraps SDK Client + transport per server
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
- On connect: negotiates capabilities, stores `serverInfo` (name, version, title, description, icons, websiteUrl) and `ServerCapabilities`
- After handshake: calls `listTools()`, `listResources()`, `listPrompts()` to build index
- Returns full SDK types preserving all fields: `title`, `icons`, `annotations`, `outputSchema`, `structuredContent`, etc.
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
- `resources/list`, `resources/read`
- `prompts/list`, `prompts/get`
- `completions/complete`
- `tasks/list`, `tasks/get`, `tasks/result`, `tasks/cancel`
- `config/reload`, `daemon/status`

### Content Types in Tool Results
Tool call results (`tools/call`) can contain multiple content types:
- `text` — plain text, displayed directly
- `image` — base64 image data, shown as `[Image: mimeType, size]` in CLI
- `audio` — base64 audio data, shown as `[Audio: mimeType, size]` in CLI
- `resource_link` — URI reference to a resource, shown as `Resource: name (uri)` in CLI
- `resource` — embedded resource with text/blob data
- `structuredContent` — typed JSON matching `outputSchema`, displayed as formatted JSON

All content types pass through unchanged in `--json` output.

### Tasks (Experimental)
Some upstream tools declare `execution.taskSupport` ("required", "optional", or "forbidden"):
- `taskSupport: "required"`: `mcpd call` uses task-based flow automatically. Without `--async`, blocks and polls until completion. With `--async`, returns task handle immediately.
- `taskSupport: "optional"`: immediate execution by default; `--async` flag triggers task mode.
- `taskSupport: "forbidden"` or absent: standard synchronous execution.

Task flow: `tools/call` returns `CreateTaskResult` with `taskId` → poll with `tasks/get` → fetch result with `tasks/result` → cancel with `tasks/cancel`.

### Error Handling
- Server fails to connect → log, mark as `error`, continue with others
- Daemon not running → auto-start it (lazy start)
- Stale PID/socket → detect dead PID, clean up, spawn fresh daemon
- Auto-restart crashed MCP servers with exponential backoff (1s → 60s max)
- Unsupported capabilities (sampling, elicitation) → fail gracefully with clear error messages

## Implementation Iterations

1. [Project Setup](./01-project-setup.md) - tooling, deps, Claude Code hooks
2. MVP (with full MCP 2025-11-25 data model):
   - [2a: Foundation](./02a-foundation.md) - types, config loader, path utilities
   - [2b: MCP Connection](./02b-mcp-connection.md) - ServerManager, ServerPool, SDK integration
   - [2c: Daemon](./02c-daemon.md) - Unix socket JSON-RPC server, daemonization, idle timeout
   - [2d: CLI](./02d-cli.md) - client, formatter, commands (`servers`, `tools`, `info`, `call`, `stop`, `status`)
3. [Complete CLI](./03-complete-cli.md) - `grep`, `resources`, `read`, `reload`, `prompts`, `completions`, tasks commands, stdin, `--json`
4. [Robustness](./04-robustness.md) - health checks, auto-restart, graceful shutdown, logging, task cleanup
5. [Advanced](./05-advanced.md) - Streamable HTTP transport, HTTP listener, Claude Desktop config merge, protocol version negotiation
