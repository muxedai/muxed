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
| Robustness spec | `/specs/04-robustness.md` | Architecture page (health checks, auto-restart, graceful shutdown, stale PID detection, request timeouts, task cleanup, Streamable HTTP resilience) and config schema (timeout fields, logging) |
| Advanced spec | `/specs/05-advanced.md` | Architecture page (Streamable HTTP transport, protocol negotiation), config schema (HTTP reconnection, session ID), Cursor & Windsurf guide (HTTP listener setup) |
| Init command spec | `/specs/06-init-command.md` | Claude Code guide, init workflow |
| JS API spec | `/specs/07-js-api.md` | Programmatic API guide |
| Typegen spec | `/specs/08-typegen.md` | Programmatic API guide (type generation, MuxedToolMap augmentation, typed call()) |
| JTBD spec | `/specs/jtbd.md` | Motivational framing for guides |
| Config source | `/packages/muxed/src/core/config.ts` | Config schema reference (Zod schemas, all defaults) |
| Types source | `/packages/muxed/src/core/types.ts` | Config schema and architecture (ServerState, ServerConfig, DaemonConfig, TrackedTask, connection statuses) |
| Client source | `/packages/muxed/src/client/index.ts` | Programmatic API (actual MuxedClient methods, CreateClientOptions, exported types) |
| Daemon source | `/packages/muxed/src/daemon/` | Architecture page (server.ts JSON-RPC methods, process.ts lock file and lifecycle, index.ts startup flow, http-server.ts listener) |
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
- Config file discovery order: explicit `--config` path → CWD `muxed.config.json` → global → empty fallback
- Global config merged as base, project config takes precedence
- Full config structure with both server types:
  - stdio servers (command, args, env, cwd)
  - HTTP servers (url, transport `streamable-http` | `sse`, headers, sessionId, reconnection options, auth)
- OAuth authentication options (client_credentials with tokenUrl/clientId/clientSecret/scope; authorization_code with authorizationUrl/tokenUrl/clientId/clientSecret/callbackPort/scope)
- Daemon settings — all actual fields with defaults:
  - `idleTimeout` (300000ms / 5min), `connectTimeout` (30000ms), `requestTimeout` (60000ms)
  - `healthCheckInterval` (30000ms), `maxRestartAttempts` (-1 / unlimited), `maxTotalTimeout` (300000ms)
  - `taskExpiryTimeout` (3600000ms / 1hr), `logLevel` (info), `shutdownTimeout` (10000ms)
  - `http` listener: `enabled` (false), `port` (3100), `host` (127.0.0.1)
- Compatibility note: format matches `mcpServers` from `claude_desktop_config.json`
- Config management CLI: `muxed mcp add`, `muxed mcp remove`, `muxed mcp list`
- Auto-discovery via `muxed init`

**Source**: README.md Configuration + Daemon Settings, `config.ts` Zod schemas, `types.ts` (DaemonConfig), `specs/04-robustness.md` (timeout/health fields), `specs/05-advanced.md` (HTTP reconnection, session ID), `specs/06-init-command.md`

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
- Using muxed's built-in MCP proxy mode (`muxed mcp` without subcommand starts stdio proxy — editors connect to this)
- Alternative: HTTP listener setup — enable `daemon.http.enabled`, set port/host, point editor to `http://127.0.0.1:3100` (plain HTTP POST, origin validation for localhost only)
- Tips for multi-editor usage (shared daemon, same config, one daemon serves all editors simultaneously)
- Config management shortcuts: `muxed mcp add`, `muxed mcp add-from-claude-desktop`

**Source**: README.md "Cursor / Windsurf" section, `specs/05-advanced.md` (HTTP listener, origin validation), `mcp.ts` command source (stdio proxy default action)

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
- Import paths: `import { createClient } from 'muxed'` or `from 'muxed/client'`
- `CreateClientOptions`: `configPath?`, `autoStart?` (default true)
- Client creation and daemon auto-start behavior
- Full API reference for `MuxedClient` — actual method signatures:
  - **Tools**: `tools(server?)`, `tool(name)`, `grep(pattern)`, `call(name, args?, options?)`, `callAsync(name, args?)`
  - **Resources**: `resources(server?)`, `read(server, uri)`
  - **Prompts**: `prompts(server?)`, `prompt(server, name, args?)`
  - **Completions**: `complete(server, ref, argument)`
  - **Tasks**: `tasks(server?)`, `task(server, taskId)`, `taskResult(server, taskId)`, `taskCancel(server, taskId)`
  - **Daemon**: `servers()`, `reload(configPath?)`, `status()`, `stop()`, `close()`
- `CallOptions`: `{ timeout?: number }`
- `CallResult` structure: `{ content: Array<{type, text?, mimeType?, data?, ...}>; structuredContent?; isError? }`
- Exported types: `Tool`, `Resource`, `Prompt`, `ServerState`, `ServerConfig`, `DaemonStatus`, `ReloadResult`, `TaskHandle`, `MuxedError`
- Type generation with `muxed typegen`:
  - Generates `muxed.generated.d.ts` via module augmentation on `MuxedToolMap` interface
  - `call()` becomes type-safe: autocomplete on tool names, typed args/output
  - Uses `json-schema-to-typescript` for schema conversion
  - Tool/property descriptions become JSDoc comments
  - Unknown tools fall back to untyped `CallResult`
  - Refresh with `muxed typegen` when tools change (like Prisma workflow)
- Error handling: `MuxedError` with `code`, `message`, `data?`
- Usage examples: listing tools, search + invoke, parallel calls, async tasks, typed calls after typegen

**Source**: `src/client/index.ts` (actual exports and method signatures), `specs/07-js-api.md`, `specs/08-typegen.md` (typegen flow, module augmentation, edge cases), README.md Node.js API section

---

### Step 9: `reference/cli-commands.mdx`

Content:
- Global option: `--config <path>` (applies to all commands)
- Complete reference for all CLI commands, organized by the 7 groups from `cli/index.ts`:
  - **Servers**: `servers [--json]`
  - **Tools**: `tools [server] [--json]`, `info <server/tool> [--json]`, `call <server/tool> [json] [--timeout <ms>] [--async] [--json]`, `grep <pattern> [--json]`
  - **Resources**: `resources [server] [--json]`, `read <server/resource> [uri] [--json]`
  - **Prompts**: `prompts [server] [--json]`, `prompt <server/prompt> [args-json] [--json]`, `completions <type> <name> <arg> <value> [--json]`
  - **Tasks**: `tasks [server] [--json]`, `task <server/taskId> [--json]`, `task-result <server/taskId> [--json]`, `task-cancel <server/taskId> [--json]`
  - **Configuration**:
    - `init [--dry-run] [--json] [-y/--yes] [--no-delete] [--no-replace]`
    - `mcp` (no subcommand = start stdio proxy for editors)
    - `mcp add <name> <commandOrUrl> [args...] [-e KEY=val] [-H Key:val] [-s scope] [-t transport] [--client-id] [--client-secret] [--callback-port] [--oauth-scope]`
    - `mcp add-json <name> <json> [-s scope]`
    - `mcp add-from-claude-desktop [-s scope]`
    - `mcp get <name> [--json]`, `mcp list [--json]`, `mcp remove <name> [-s scope]`
    - `typegen [-c/--config <path>]`
  - **Daemon**: `daemon start [--json]`, `daemon stop`, `daemon reload [--json]`, `daemon status [--json]`
- For each command: syntax, arguments, all flags, description, example
- stdin support for `call` command (pass `-` as json argument to read from stdin)
- Note: `--json` available on all read commands for machine-readable output

**Source**: All 19 command files in `src/cli/commands/`, `src/cli/index.ts` (grouping), `specs/02d-cli.md`, README.md CLI table

---

### Step 10: `reference/config-schema.mdx`

Content:
- Top-level `MuxedConfig` schema: `{ mcpServers, daemon?, mergeClaudeConfig? }`
- `mcpServers` object (key = server name, value = `StdioServerConfig | HttpServerConfig`)
- `StdioServerConfig` fields: `command` (string, required), `args` (string[]), `env` (Record<string,string>), `cwd` (string)
- `HttpServerConfig` fields: `url` (string, required), `transport` (`streamable-http` | `sse`), `headers` (Record<string,string>), `sessionId` (string), `reconnection` ({ maxDelay, initialDelay, growFactor, maxRetries }), `auth` (OAuthConfig)
- OAuth schemas:
  - `ClientCredentialsAuth`: `type: "client_credentials"`, `tokenUrl`, `clientId`, `clientSecret`, `scope?`
  - `AuthorizationCodeAuth`: `type: "authorization_code"`, `authorizationUrl`, `tokenUrl`, `clientId`, `clientSecret`, `callbackPort?`, `scope?`
- `DaemonConfig` — all fields with types and defaults:
  - `idleTimeout` (number, 300000), `connectTimeout` (number, 30000), `requestTimeout` (number, 60000)
  - `healthCheckInterval` (number, 30000), `maxRestartAttempts` (number, -1)
  - `maxTotalTimeout` (number, 300000), `taskExpiryTimeout` (number, 3600000)
  - `logLevel` (`debug` | `info` | `warn` | `error`, default `info`)
  - `shutdownTimeout` (number, 10000)
  - `http`: `{ enabled (bool, false), port (number, 3100), host (string, "127.0.0.1") }`
- Config file resolution order: explicit path → CWD → global → empty
- Global config merged as base, project-level takes precedence
- `mergeClaudeConfig` option to auto-merge Claude Desktop servers
- Example: minimal config (one stdio server), full config with all options (HTTP + OAuth + daemon + http listener)

**Source**: `config.ts` Zod schemas (exact field names, types, defaults), `types.ts` (DaemonConfig, ServerConfig union, type guards), `specs/04-robustness.md` (timeout/health/restart fields), `specs/05-advanced.md` (HTTP reconnection, session ID, mergeClaudeConfig)

---

### Step 11: `reference/architecture.mdx`

Content:
- High-level architecture diagram (CLI → Unix socket → daemon → MCP servers)
- Daemon startup flow: load config → create ServerPool → connect servers → auto-generate types → create JSON-RPC server → optionally start HTTP listener → write PID file → signal ready
- Lock file mechanism: atomic lock at `~/.config/muxed/muxed.lock` prevents race conditions during startup, validates lock holder is alive and is muxed process
- Stale daemon detection: verify PID via `/proc`, confirm process is muxed/node, test socket connection, clean up if stale
- IPC protocol: Unix socket, newline-delimited JSON-RPC 2.0, one-shot connections per request
- JSON-RPC method table (18 methods): `servers/list`, `tools/list`, `tools/info`, `tools/call`, `tools/call-async`, `tools/grep`, `resources/list`, `resources/read`, `prompts/list`, `prompts/get`, `completions/complete`, `tasks/list`, `tasks/get`, `tasks/result`, `tasks/cancel`, `auth/status`, `daemon/status`, `config/reload`, `daemon/stop`
- Optional HTTP listener: plain `http.createServer`, POST-only, origin validation (localhost only), delegates to same handler as socket
- ServerPool: manages all MCP server connections, per-server connection states (`connecting`, `connected`, `error`, `closed`)
- Health checks: periodic `ping()` at configurable interval, consecutive failure tracking, mark server as `error` after threshold
- Auto-reconnect: exponential backoff (1s → 60s), configurable max attempts, backoff reset on success
- Graceful shutdown: SIGTERM/SIGINT handling → stop accepting connections → wait for in-flight requests (with `shutdownTimeout`) → disconnect all servers → kill child processes → remove socket/PID files → exit
- Transport types: stdio (local servers), Streamable HTTP (remote, with `MCP-Session-Id` and `MCP-Protocol-Version` headers, SSE reconnection with `Last-Event-ID`), SSE (legacy)
- Protocol version negotiation: request `2025-11-25`, SDK handles downgrade, store negotiated version per server
- MCP capability support: tools (title, annotations, outputSchema, structuredContent), resources (text/blob), prompts (argument rendering), completions, tasks (async operations)
- Content types: text, image, audio, resource links, structured content
- Task system: `callAsync` → `TaskHandle`, track active tasks per server, mark unreachable on disconnect, re-query on reconnect, configurable expiry timeout
- Idle shutdown: configurable timeout (default 5min), resets on each request, can be disabled

**Source**: `specs/architecture.md`, `specs/04-robustness.md` (health checks, auto-restart, graceful shutdown, stale detection, request timeouts, task cleanup), `specs/05-advanced.md` (Streamable HTTP transport, HTTP listener, protocol negotiation), `src/daemon/server.ts` (JSON-RPC method table), `src/daemon/process.ts` (lock file, lifecycle), `src/daemon/index.ts` (startup flow), README.md Architecture section

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
