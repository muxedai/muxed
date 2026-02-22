# Documentation Implementation Plan for muxed

## Overview

The muxed website (`packages/website`) uses **Astro Starlight** with MDX. The sidebar structure and 11 empty doc stubs already exist. The task is to populate all pages with content, drawing from the rich source material in `README.md`, `specs/`, and source code.

## Content Sources

| Source | Location | Use For |
|--------|----------|---------|
| Landing page | `/packages/website/src/pages/index.astro` | Problem framing (stats, context engineering), feature descriptions, code examples (discovery, chaining, Node.js API), before/after context visualization, 3-step getting started flow |
| Project README | `/README.md` | Quick start, config, CLI table, architecture diagram, comparison |
| Architecture spec | `/specs/architecture.md` | Architecture page, daemon lifecycle, IPC protocol |
| CLI spec | `/specs/02d-cli.md` | CLI commands reference |
| Init command spec | `/specs/06-init-command.md` | Claude Code guide, init workflow |
| JS API spec | `/specs/07-js-api.md` | Programmatic API guide |
| JTBD spec | `/specs/jtbd.md` | Motivational framing for guides |
| Config source | `/packages/muxed/src/core/config.ts` | Config schema reference (Zod schemas) |
| CLI commands source | `/packages/muxed/src/cli/commands/*.ts` | CLI reference (flags, args, behavior) |
| Formatter source | `/packages/muxed/src/cli/formatter.ts` | Output format examples |

## Implementation Steps

### Step 1: `docs/index.mdx` — Overview page

Expand the existing one-liner into a proper docs landing page:
- Brief explanation of what muxed is and the problem it solves
- The problem stats from the landing page (98.7% token overhead, 20-30% context consumed, 2-3 server limit before accuracy collapses)
- Key features list (lazy discovery, daemon, CLI + API, context reclamation)
- Context engineering framing: skills and prompts get followed when MCP schemas are offloaded
- "Where to go next" links to Getting Started, Guides, and Reference sections

**Source**: Landing page (problem stats, feature cards, context engineering narrative), README.md intro sections, `specs/jtbd.md`

---

### Step 2: `getting-started/installation.mdx`

Content:
- Prerequisites (Node.js 18+, npm/pnpm)
- Global install: `npm install -g muxed`
- npx usage: `npx muxed <command>` (no install needed)
- Verify installation: `muxed --version` / `muxed servers`
- Note about the daemon auto-starting on first command

**Source**: README.md Quick Start section

---

### Step 3: `getting-started/quick-start.mdx`

Content:
- Follow the landing page's 3-step flow: `npx muxed init` → `muxed tools` → `muxed call server/tool '{}'`
- Minimal `muxed.config.json` example with one server (filesystem)
- Show the discovery flow from the landing page code example: `muxed grep "read"` → `muxed info filesystem/read_file` → `muxed call filesystem/read_file '{"path": "..."}'`
- Explain what happened (daemon started, server connected, tool invoked)
- "Next steps" pointing to Configuration and Guides

**Source**: Landing page (3-step CTA, discovery code example), README.md Quick Start + Configuration sections

---

### Step 4: `getting-started/configuration.mdx`

Content:
- Config file locations (project-level `muxed.config.json`, global `~/.config/muxed/config.json`)
- Config file discovery order
- Full config structure with both server types:
  - stdio servers (command, args, env, cwd)
  - HTTP servers (url, transport, headers, auth)
- OAuth authentication options (client_credentials, authorization_code)
- Daemon settings (idleTimeout, connectTimeout, requestTimeout, healthCheck, http listener)
- Compatibility note: format matches `mcpServers` from `claude_desktop_config.json`
- Config management CLI: `muxed mcp add`, `muxed mcp remove`, `muxed mcp list`
- Auto-discovery via `muxed init`

**Source**: README.md Configuration + Daemon Settings, `config.ts` Zod schemas, `specs/06-init-command.md`

---

### Step 5: `guides/claude-code.mdx`

Content:
- Why muxed matters for Claude Code (context window optimization)
- Reuse the landing page's context engineering framing: skills and prompts are deterministic, MCP tools compete for attention — offloading tools to muxed means trajectories hold
- Reference the landing page's before/after trajectory comparison (without muxed: wrong tools, skill never loaded; with muxed: skill loads, grep finds tool, done)
- Setup flow:
  1. Install muxed
  2. Run `muxed init` to auto-discover servers from Claude Desktop config
  3. Add muxed as an MCP tool source in Claude Code settings
- The `muxed init` workflow: discovery → deduplication → conflict resolution → config generation
- Show the Claude Code MCP config snippet pointing to muxed
- Explain the agent instructions injected by muxed (grep → info → call pattern)
- Before/after context window comparison from landing page (30% MCP schemas → 30% free)

**Source**: Landing page (trajectory comparison, context before/after visualization, context engineering narrative), `specs/06-init-command.md`, README.md "Use with AI Coding Agents" section

---

### Step 6: `guides/cursor-windsurf.mdx`

Content:
- Cursor setup: adding muxed as an MCP server in Cursor's config
- Windsurf setup: similar config approach
- Using muxed's built-in MCP proxy mode (`muxed mcp` stdio proxy)
- Alternative: HTTP transport setup (enable daemon HTTP listener, point editor to it)
- Tips for multi-editor usage (shared daemon, same config)

**Source**: README.md "Cursor / Windsurf" section, `specs/architecture.md` transport details, `mcp.ts` command source

---

### Step 7: `guides/custom-agents.mdx`

Content:
- Why build agents with muxed (tool chaining, bash scripting, Node.js automation)
- CLI-based agents: chain `muxed call` commands in shell scripts
- Adapt the landing page's bash chaining example: postgres/query → jq → filesystem/write_file piped with `--json` and stdin `-`
- Node.js agents: use `createClient()` API for typed tool access
- Adapt the landing page's Node.js example: posthog/query-run → parallel intercom/search-conversations calls
- Pattern: discover → filter → call → process → chain
- Async tasks for long-running operations

**Source**: Landing page (bash chaining code example, Node.js API code example), `specs/07-js-api.md`, README.md Node.js API section, `specs/jtbd.md` automation section

---

### Step 8: `guides/programmatic-api.mdx`

Content:
- Installation: `npm install muxed`
- Import: `import { createClient } from 'muxed'`
- Client creation and daemon auto-start
- Full API reference for `MuxedClient`:
  - `servers()`, `tools()`, `grep()`, `info()`
  - `call()`, `callAsync()`, `task()`, `taskResult()`, `taskCancel()`
  - `resources()`, `readResource()`
  - `prompts()`, `getPrompt()`
  - `completions()`
  - `reload()`, `status()`, `stop()`
- Type generation with `muxed typegen`
- Error handling (`MuxedError`)
- Usage examples: listing tools, search + invoke, parallel calls, async tasks

**Source**: `specs/07-js-api.md`, `specs/08-typegen.md`, README.md Node.js API section

---

### Step 9: `reference/cli-commands.mdx`

Content:
- Complete reference for all CLI commands, organized by group:
  - **Servers**: `servers`
  - **Tools**: `tools`, `info`, `call`, `grep`
  - **Resources**: `resources`, `read`
  - **Prompts**: `prompts`, `prompt`, `completions`
  - **Tasks**: `tasks`, `task`, `task-result`, `task-cancel`
  - **Configuration**: `init`, `mcp` (add, add-json, add-from-claude-desktop, get, list, remove), `typegen`
  - **Daemon**: `daemon start`, `daemon stop`, `daemon reload`, `daemon status`
- For each command: syntax, arguments, flags (--json, --timeout, --async, etc.), description, example
- Global flags: `--json` for machine-readable output
- stdin support for `call` command (pipe JSON via `-`)

**Source**: All 18 command files in `src/cli/commands/`, `specs/02d-cli.md`, README.md CLI table

---

### Step 10: `reference/config-schema.mdx`

Content:
- Top-level `MuxedConfig` schema
- `mcpServers` object (key = server name, value = server config)
- `StdioServerConfig` fields: command, args, env, cwd
- `HttpServerConfig` fields: url, transport (streamable-http | sse), headers, auth
- OAuth auth schemas: `ClientCredentialsAuth`, `AuthorizationCodeAuth`
- `DaemonConfig` fields: idleTimeout, connectTimeout, requestTimeout, healthCheck, http
- Default values for all fields
- Config file resolution order
- Environment variable support in env fields
- Example: minimal config, full config with all options

**Source**: `config.ts` Zod schemas (exact field names, types, defaults)

---

### Step 11: `reference/architecture.mdx`

Content:
- High-level architecture diagram (daemon + CLI + servers)
- Daemon lifecycle: lazy start → serve requests → idle shutdown
- IPC protocol: Unix socket communication, JSON-RPC messages
- Server management: ServerManager per server, connection states, reconnection
- Health checks and stale PID detection
- MCP 2025-11-25 capability support matrix
- Transport types: stdio, streamable-http, SSE
- Content types: text, image, audio, resource links, structured content
- Task system for long-running operations

**Source**: `specs/architecture.md`, README.md Architecture section

---

## Execution Order

The steps above are ordered by dependency — earlier pages provide foundational concepts referenced by later ones:

1. Index (overview) — sets the stage
2. Installation — prerequisite for everything
3. Quick Start — first hands-on experience
4. Configuration — deeper config knowledge
5. Claude Code guide — primary use case
6. Cursor & Windsurf guide — secondary use cases
7. Custom Agents guide — advanced usage
8. Programmatic API guide — developer API
9. CLI Commands reference — comprehensive reference
10. Config Schema reference — schema details
11. Architecture reference — internals

## Build Verification

After all content is written, run the website build to verify no MDX errors:

```bash
cd packages/website && pnpm build
```
