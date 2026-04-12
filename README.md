# muxed

<div align="center">

<strong>MCP tools don't belong in your model's context window.</strong>

Offload them to a CLI. Let your agents call tools through shell commands and scripts instead.

[![npm](https://img.shields.io/npm/v/muxed.svg)](https://www.npmjs.com/package/muxed)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[Docs](https://muxed.ai) · [npm](https://www.npmjs.com/package/muxed)

</div>

---

Every MCP server you connect dumps its full tool schema into the model's context window. A standard setup with 3-4 servers can consume 20-30% of the context before the agent even starts working. More tools in context means worse tool selection, less room for reasoning, and your carefully crafted instructions get drowned out by thousands of tokens of schema JSON. This isn't a model problem. It's an architecture problem.

**muxed** fixes this by moving tool management out of the harness and into a CLI. Tools stay in the CLI — agents discover and call them on-demand through shell commands. No schemas in context. Chain tool calls in bash scripts without intermediate results flowing through the LLM. The CLI auto-starts a background process on first command and shuts down after 5 minutes idle.

---

## Use with agents

```bash
# Use directly — no install needed
bunx muxed init         # or: pnpx muxed init / npx muxed init

# Or install globally
bun install -g muxed    # or: pnpm install -g muxed / npm install -g muxed
```

<table>
<tr>
<td valign="top" width="50%">

**CLI** — for Claude Code, Cursor, Codex, any agent that runs shell

```bash
npx muxed init
```

Auto-discovers MCP servers and writes usage instructions to the agent's instructions file. Agents run `npx muxed grep`, `npx muxed info`, and `npx muxed call` directly.

</td>
<td valign="top" width="50%">

**MCP proxy** — for Claude Desktop, any MCP client

```bash
npx muxed mcp
```

Exposes all aggregated servers as a single MCP server on stdio. Point your client at `npx muxed mcp` and all tools appear as one server.

</td>
</tr>
</table>

## Quick start

```bash
# List all servers and their status
npx muxed servers

# Search tools by name or description
npx muxed grep "search"

# Get a tool's schema
npx muxed info slack/search_messages

# Call a tool
npx muxed call filesystem/read_file '{"path": "/tmp/hello.txt"}'
```

## Configuration

Create `muxed.config.json` in your project root (or `~/.config/muxed/config.json` globally):

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user/projects"]
    },
    "remote-api": {
      "url": "https://mcp.example.com/mcp",
      "transport": "streamable-http"
    }
  }
}
```

The format is compatible with the `mcpServers` section of `claude_desktop_config.json` — reuse your existing config.

## Node.js API

```typescript
import { createClient } from 'muxed';

const client = await createClient();
const tools = await client.grep('search');
const result = await client.call('filesystem/read_file', { path: '/tmp/config.json' });
```

Install as a dependency: `bun add muxed` / `pnpm add muxed` / `npm install muxed`

## How it works

```
  Agent (Claude Code, Cursor, etc.)
            |
       shell commands
            |
     ┌──────┴──────┐
     │  muxed daemon │  ← background process, auto-start/stop
     │              │
     │  ServerPool  │
     │   ├── fs     │──► [stdio: filesystem server]
     │   ├── pg     │──► [stdio: postgres server]
     │   └── api    │──► [HTTP: remote server]
     └──────────────┘
```

## Development

```bash
pnpm install && pnpm build
pnpm dev    # run from source
pnpm test   # vitest
```

## License

[MIT](LICENSE) © Georgiy Tarasov
