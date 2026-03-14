# muxed – MCP Server Daemon & Aggregator CLI

> Aggregate all your [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) servers behind a single daemon. Fewer tokens. Faster execution. Better accuracy.

**muxed** is a background daemon and CLI that sits between your AI agent and your MCP servers. It solves the problems that [Anthropic](https://www.anthropic.com/engineering/code-execution-with-mcp) and [Cloudflare](https://blog.cloudflare.com/code-mode/) have been writing about: tool sprawl eating your context window, slow cold starts, and degraded accuracy as you add more servers.

## The Problem

The MCP ecosystem has a scaling problem. Every tool you connect dumps its full schema into the model's context window. A standard setup with 3-4 MCP servers can consume 20-30% of the context before the agent even starts working. Anthropic's research shows this leads to a 98.7% token overhead on intermediate results. Cloudflare found that agents can't reliably handle more than a handful of servers before tool selection accuracy collapses.

**More tools = worse results.** Every token spent on MCP tool schemas is a token not spent on your actual task – or on the skills, prompts, and default tools that agents execute deterministically.

## How muxed Fixes This

**muxed** is an optimization layer for your MCP infrastructure:

- **Fewer tokens in context** – Tools stay in the daemon, not in the prompt. Agents discover tools on-demand with `muxed grep` and `muxed info` instead of loading every schema upfront. Load only what you need, when you need it.
- **Faster execution** – Servers stay warm in a background daemon. No cold starts, no repeated connection negotiation. Call tools directly via CLI without round-tripping through the model.
- **More precise tool selection** – By offloading tool management to muxed, your agent's context window stays clean for what actually matters: reasoning, prompts, and the task at hand. Fewer tools in context means the model picks the right one more often.
- **Chain calls outside the model** – Pipe tool results through scripts and chain `muxed call` commands in bash without every intermediate result flowing through the LLM. This is the same insight behind Anthropic's code execution approach and Cloudflare's Code Mode – but available today as a simple CLI.
- **Context engineering wins** – When MCP tools are offloaded to muxed, your context window is freed for skills, prompts, and default tools – the things agents execute deterministically with higher priority. Context engineering beats tool bloat: fewer MCP schemas means your carefully crafted instructions actually get followed.

### For Agents in Production

When you offload MCP tools to muxed, your agents' context windows free up for what actually gets executed reliably: skills, prompts, and default tools. These have deterministic priority – models always follow them. MCP tools, by contrast, compete for attention in a crowded context and get picked less reliably as you add more. By moving tool management out of the model and into a daemon, you're doing context engineering at the infrastructure level – your carefully crafted instructions get followed instead of being drowned out by 30,000 tokens of tool schemas.

## Quick Start

```bash
# Install globally
npm install -g muxed

# Or use directly with npx
npx muxed tools

# List all servers and their status
muxed servers

# List all available tools across all servers
muxed tools

# Call a tool
muxed call filesystem/read_file '{"path": "/tmp/hello.txt"}'

# Search tools by name or description
muxed grep "search"

# The daemon starts automatically and stops after 5 min idle
```

## Configuration

Create `muxed.config.json` in your project root (or `~/.config/muxed/config.json` for global config):

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user/projects"],
      "env": {}
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": { "DATABASE_URL": "postgresql://..." }
    },
    "remote-api": {
      "url": "https://mcp.example.com/mcp",
      "transport": "streamable-http",
      "headers": { "Authorization": "Bearer ..." }
    }
  }
}
```

The format is intentionally compatible with the `mcpServers` section of `claude_desktop_config.json` – you can reuse your existing config.

## Architecture

```
  muxed call server/tool '{}'
  ──────────────────────────────────►  ┌──────────────────────┐
  (Unix socket: ~/.muxed/muxed.sock)    │     muxed daemon      │
                                      │                      │
  muxed tools                          │  ServerManager(fs)   │──► [stdio: filesystem]
  ──────────────────────────────────►  │  ServerManager(pg)   │──► [stdio: postgres]
                                      │  ServerManager(...)   │──► [HTTP: remote]
  muxed servers                        │                      │
  ──────────────────────────────────►  └──────────────────────┘
                                       (auto-exits after idle)
```

**Lazy start**: The daemon spawns automatically when you run any command. No explicit `muxed start` needed.

**Idle shutdown**: After 5 minutes (configurable) with no requests, the daemon shuts down and cleans up.

## CLI Reference

| Command                                         | Description                                          |
| ----------------------------------------------- | ---------------------------------------------------- |
| `muxed servers`                                 | List servers with connection status and capabilities |
| `muxed tools [server]`                          | List available tools (with annotations)              |
| `muxed info <server/tool>`                      | Tool schema details (inputSchema, outputSchema)      |
| `muxed call <server/tool> [json]`               | Invoke a tool                                        |
| `muxed call ... --dry-run`                      | Validate arguments without executing                 |
| `muxed call ... --fields <paths>`               | Extract specific fields from the response            |
| `muxed grep <pattern>`                          | Search tool names, titles, and descriptions          |
| `muxed resources [server]`                      | List resources                                       |
| `muxed read <server/resource>`                  | Read a resource                                      |
| `muxed prompts [server]`                        | List prompt templates                                |
| `muxed prompt <server/prompt> [args]`           | Render a prompt                                      |
| `muxed completions <type> <name> <arg> <value>` | Argument auto-completions                            |
| `muxed tasks [server]`                          | List active tasks                                    |
| `muxed status`                                  | Daemon status, PID, uptime                           |
| `muxed reload`                                  | Reload config, reconnect changed servers             |
| `muxed stop`                                    | Stop daemon manually                                 |
| `muxed init`                                    | Generate config from discovered MCP servers          |

All commands support `--json` for machine-readable output.

## Agent-Friendly Features

### Structured Errors with Recovery Suggestions

When a tool call fails, muxed returns structured error data with actionable suggestions and fuzzy-matched similar tool names — so agents can self-correct instead of guessing.

```bash
muxed call slack/search_msgs '{}' --json
# {
#   "code": -32602,
#   "message": "Tool not found: slack/search_msgs",
#   "data": {
#     "code": "TOOL_NOT_FOUND",
#     "suggestion": "Did you mean: slack/search_messages, slack/search_files? Run 'muxed grep <pattern>' to search available tools.",
#     "context": { "similarTools": ["slack/search_messages", "slack/search_files"] }
#   }
# }
```

Error codes include `TOOL_NOT_FOUND`, `SERVER_NOT_FOUND`, `SERVER_NOT_CONNECTED`, `INVALID_FORMAT`, `MISSING_PARAMETER`, `INVALID_ARGUMENTS`, and `TIMEOUT`.

### Dry-Run Validation

Validate arguments against a tool's schema without executing the call. Catches mistakes before wasting tokens on failed calls.

```bash
muxed call postgres/query '{"sql": "DROP TABLE users"}' --dry-run
# Validation: passed
# Warnings:
#   - Tool is marked as destructive.
#   - Tool is not marked as idempotent.
```

### Response Field Filtering

Extract only the fields you need from tool responses. Reduces context window consumption when responses are large. Only applies to JSON-parseable outputs — non-JSON text is returned unchanged.

```bash
muxed call postgres/query '{"sql": "SELECT * FROM users"}' --fields "rows[].name,rows[].email"
```

Supports dot-notation paths (`data.user.name`) and array extraction (`rows[].field`). Works on `structuredContent` and JSON embedded in text content blocks.

## Node.js API

muxed is also an npm package. Agents can write Node.js scripts that call MCP tools programmatically – with typed results, async/await, and the full npm ecosystem.

```typescript
import { createClient } from 'muxed';

const client = await createClient();

// Discover tools
const tools = await client.grep('search');

// Call a tool
const result = await client.call('filesystem/read_file', {
  path: '/tmp/config.json',
});

// Validate before calling (dry-run)
const check = await client.validate('postgres/query', { sql: 'DROP TABLE users' });
// check.valid, check.errors, check.warnings

// Call with field filtering
const filtered = await client.call('postgres/query', { sql: 'SELECT * FROM users' }, {
  fields: ['rows[].name', 'rows[].email'],
});

// Parallel calls across servers
const [users, tickets] = await Promise.all([
  client.call('posthog/query-run', { query: { kind: 'HogQLQuery', query: 'SELECT ...' } }),
  client.call('intercom/search-conversations', { query: 'billing', limit: 10 }),
]);

// Async tasks for long-running operations
const task = await client.callAsync('analytics/export', { range: '30d' });
const status = await client.task(task.server, task.taskId);
```

Install as a dependency for programmatic use:

```bash
npm install muxed
```

The client auto-starts the daemon if it isn't running. Both `import from 'muxed'` and `import from 'muxed/client'` work.

## Use with AI Coding Agents

### Claude Code

Add muxed as a tool source in your Claude Code configuration. The `muxed init` command can auto-discover MCP servers from your `claude_desktop_config.json` and generate an `muxed.config.json`.

### Cursor / Windsurf / Other Agents

Any agent that supports MCP can connect to muxed's daemon via the Unix socket or optional HTTP listener.

## Daemon Settings

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

## Key Features

### Connection Management

- Automatic reconnection with exponential backoff (1s → 60s)
- Periodic health checks via `ping()`
- Stale PID/socket detection and cleanup

### Full MCP 2025-11-25 Support

- **Tools** with `title`, `annotations`, `outputSchema`, `structuredContent`
- **Resources** with text and blob content types
- **Prompts** with argument rendering
- **Completions** for argument auto-complete
- **Tasks** for long-running operations (`--async` flag)
- **Content types**: text, image, audio, resource links, structured content

### Transport Support

- **stdio** – for local MCP servers (default)
- **Streamable HTTP** – for remote MCP servers
- **SSE** – legacy support for older servers

## Replacing mcp-remote

If you're using `mcp-remote` to connect Claude Desktop or ChatGPT to remote MCP servers, muxed is a drop-in upgrade. Instead of adding N separate `mcp-remote` proxy entries to your config, point at one muxed daemon that manages all your remote (and local) servers – with connection pooling, health checks, auto-reconnect, and a CLI for free.

```jsonc
// Before: mcp-remote in claude_desktop_config.json
{ "command": "npx", "args": ["mcp-remote", "https://mcp.example.com/sse"] }

// After: muxed.config.json
{ "url": "https://mcp.example.com/mcp", "transport": "streamable-http" }
```

## Comparison with Alternatives

| Feature                               | muxed | mcp-remote | mcp-proxy | MetaMCP | 1MCP    |
| ------------------------------------- | ----- | ---------- | --------- | ------- | ------- |
| Background daemon                     | ✅    | ❌         | ❌        | ❌      | ❌      |
| Lazy start / idle shutdown            | ✅    | ❌         | ❌        | ❌      | ❌      |
| Multi-server aggregation              | ✅    | ❌         | ✅        | ✅      | ✅      |
| CLI interface                         | ✅    | ❌         | ❌        | ❌      | ✅      |
| Auto-reconnect / health checks        | ✅    | ❌         | ❌        | ✅      | ✅      |
| MCP 2025-11-25                        | ✅    | Partial    | Partial   | Partial | Partial |
| Task support                          | ✅    | ❌         | ❌        | ❌      |         |
| Dry-run validation                    | ✅    | ❌         | ❌        | ❌      | ❌      |
| Structured errors with suggestions    | ✅    | ❌         | ❌        | ❌      | ❌      |
| Response field filtering              | ✅    | ❌         | ❌        | ❌      | ❌      |
| Zero config start                     | ✅    | ❌         | ❌        | ❌      |         |
| Config compatible with Claude Desktop | ✅    | ❌         | ✅        | ❌      |         |

## Development

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm dev

# Build
pnpm build

# Run tests
pnpm test

# Type check
pnpm type-check

# Format
pnpm format
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE) © Georgiy Tarasov

## Links

- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Awesome MCP Servers](https://github.com/punkpeye/awesome-mcp-servers)
