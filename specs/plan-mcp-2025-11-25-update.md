# Plan: Update mcpd Specs for MCP 2025-11-25

## Context

The mcpd spec files (`specs/architecture.md`, `specs/02-mvp.md`, `specs/03-complete-cli.md`, `specs/04-robustness.md`, `specs/05-advanced.md`) were written against an older MCP spec version. The MCP 2025-11-25 specification introduces significant new features and data model changes. The specs need to be updated so that the implementing agent has full context of all protocol capabilities when building mcpd.

mcpd is a **proxy/aggregator** -- it acts as an MCP **client** to upstream servers and exposes a **CLI** to agents. This means:
- **Pass through**: New data fields (title, icons, annotations, outputSchema, structuredContent, audio, resource_link) must be preserved in internal types, IPC, and CLI output
- **Active support**: Tasks (experimental), completions, prompts commands, Streamable HTTP transport need new logic
- **Not supported**: Elicitation, sampling, and roots (server-to-client requests) cannot be proxied to a CLI caller

---

## Files to Modify

1. `specs/architecture.md`
2. `specs/02-mvp.md`
3. `specs/03-complete-cli.md`
4. `specs/04-robustness.md`
5. `specs/05-advanced.md`

---

## Changes Per File

### 1. `specs/architecture.md`

**Add "MCP Protocol Version" note** at top of architecture section:
- mcpd targets MCP spec `2025-11-25`

**Update CLI Commands table** -- add:
| Command | Description |
|---------|-------------|
| `mcpd prompts [server] [--json]` | List prompt templates |
| `mcpd prompt <server/prompt> [args-json] [--json]` | Get a prompt |
| `mcpd completions <type> <name> <arg> <value> [--json]` | Argument auto-completions |
| `mcpd tasks [server] [--json]` | List active tasks |
| `mcpd task <taskId> [--json]` | Get task status |
| `mcpd task-result <taskId> [--json]` | Get completed task result |
| `mcpd task-cancel <taskId>` | Cancel a running task |

Update `call` command: add `--async` flag for task-based execution.

**Update Configuration section**:
- HTTP server config adds `headers`, `sessionId` fields
- Default transport for URL-based servers is `streamable-http`

**Update Project Structure tree** -- add:
```
src/cli/commands/prompts.ts, prompt.ts, completions.ts
src/cli/commands/tasks.ts, task.ts, task-result.ts, task-cancel.ts
```

**Add new subsection: "Capability Negotiation"**:
- mcpd declares client capabilities: `{ tasks: { list: {}, cancel: {} } }`
- mcpd does NOT declare: `sampling`, `elicitation`, `roots`
- mcpd reads and stores server capabilities after handshake

**Add new subsection: "Features Not Supported"**:
- Elicitation (server requests user input -- CLI cannot relay)
- Sampling (server requests LLM completion -- CLI cannot relay)
- Roots (client provides filesystem paths -- not applicable to CLI)
- Document that tools requiring these features will fail gracefully

**Update Daemon IPC Protocol** -- add methods:
- `prompts/list`, `prompts/get`
- `completions/complete`
- `tasks/list`, `tasks/get`, `tasks/result`, `tasks/cancel`

**Update Implementation Iterations** summary to reflect expanded scope.

---

### 2. `specs/02-mvp.md`

**Step 1 (Core types)** -- update type definitions:
- Note: import SDK types directly (`Tool`, `Resource`, `Prompt`, `Implementation`, `ServerCapabilities` from `@modelcontextprotocol/sdk/types.js`) rather than redefining
- `HttpServerConfig`: add `transport?: 'streamable-http' | 'sse'`, `headers?: Record<string, string>`
- `CachedTool`: now includes `title`, `icons`, `outputSchema`, `annotations` (readOnlyHint, destructiveHint, idempotentHint, openWorldHint), `execution` (taskSupport)
- `CachedResource`: now includes `title`, `size`, `icons`, `annotations` (audience, priority, lastModified)
- Add `CachedPrompt` type: `name`, `title`, `description`, `icons`, `arguments`
- `ServerStatus` type: add `serverInfo` (name, version, title, description, icons, websiteUrl), `capabilities`, `protocolVersion`

**Step 4 (Server Manager)** -- updates:
- `connect()`: pass `Implementation` info (`name: 'mcpd'`, `version`, `title: 'mcpd - MCP Proxy/Aggregator'`). Declare client capabilities (tasks only, no sampling/elicitation/roots). Store server capabilities, serverInfo, instructions after handshake.
- `listTools()`: return full `Tool` objects including title, icons, outputSchema, annotations, execution
- `callTool()`: return full result including `structuredContent`, all content types (text, image, audio, resource_link, resource)
- Add `getServerInfo()`: returns server Implementation data
- Add `getCapabilities()`: returns ServerCapabilities

**Step 5 (Server Pool)** -- updates:
- `listServers()`: include serverInfo (title, description, icons) per server
- `listAllTools()`: pass through full tool metadata

**Step 6 (Daemon server)** -- updates:
- `tools/list` handler: return full tool objects with new fields
- `tools/call` handler: return full result with structuredContent and all content types
- `tools/info` handler: include outputSchema, annotations, execution, icons
- `daemon/status` handler: include per-server title, capabilities summary, protocolVersion

**Step 10 (CLI formatter)** -- updates:
- Tool list: show `title` as display name (fallback to `name`), show annotation hints as tags (`[read-only]`, `[destructive]`, `[idempotent]`)
- Tool info: show `outputSchema` alongside `inputSchema`, show `annotations`, `execution.taskSupport`
- Tool call results: handle `audio` (show `[Audio: mimeType, size]`), `resource_link` (show URI + name), `structuredContent` (formatted JSON), `resource` (embedded -- show URI + content indicator)
- Server list: show server `title` if available
- All new fields pass through in `--json` mode unchanged

**Verification** -- add:
- Verify new fields (title, annotations) appear in `tools` output
- Verify `servers` shows server title/description

---

### 3. `specs/03-complete-cli.md`

**Update existing steps:**
- `grep` command: also search `title` field (not just name + description)
- `resources` command: display `title`, `annotations` fields
- Daemon handlers: resource types include `title`, `size`, `icons`, `annotations`

**Add new steps:**

**Prompts command** (`src/cli/commands/prompts.ts`):
- Optional server filter
- Send `prompts/list` to daemon
- Display: `server/name`, `title`, `description`, argument count

**Prompt command** (`src/cli/commands/prompt.ts`):
- Accept `server/prompt` and optional JSON args
- Send `prompts/get` to daemon
- Display prompt messages with all content types

**Completions command** (`src/cli/commands/completions.ts`):
- Accept ref type (prompt/resource), name, argument name, partial value
- Send `completions/complete` to daemon
- Display completion values

**Task commands:**
- `tasks` command: list active tasks across servers (taskId, status, server)
- `task` command: get single task status by taskId
- `task-result` command: get completed task result
- `task-cancel` command: cancel a running task

**Update `call` command:**
- Add `--async` flag: triggers task-based execution
- For `taskSupport: "required"` tools: automatically use task mode (poll until done unless `--async`)
- For `taskSupport: "optional"` tools: use task mode only with `--async`
- `--async` returns immediately with task handle: `Task created: <taskId> (status: working)`

**Add daemon-side handlers:**
- `prompts/list`, `prompts/get`: delegate to server-manager
- `completions/complete`: delegate to server-manager
- `tasks/list`, `tasks/get`, `tasks/result`, `tasks/cancel`: delegate to server-pool which routes to correct server

**Add to server-manager:**
- `listPrompts()`, `getPrompt(name, args)`: use SDK client
- `complete(ref, argument)`: use SDK client
- `listTasks()`, `getTask(taskId)`, `getTaskResult(taskId)`, `cancelTask(taskId)`: use SDK client
- `callToolWithTask(name, args)`: create task-augmented tool call
- Check server capabilities before calling task/completion methods

**Add to server-pool:**
- `listAllPrompts(server?)`: aggregate across servers
- `getPrompt(server, name, args)`: delegate
- `complete(server, ref, argument)`: delegate
- Task operations: route by server name prefix on taskId

**Verification** -- add:
- `mcpd prompts` lists prompts with title
- `mcpd call everything/longTool --async` returns task handle
- `mcpd tasks` shows active tasks
- `mcpd task-result <id>` shows result

---

### 4. `specs/04-robustness.md`

**Step 6 (Request timeout)** -- add:
- Task-augmented requests: initial `callTool` returns quickly with `CreateTaskResult`. Timeout applies to blocking poll in non-async mode.
- Option `resetTimeoutOnProgress: true` for blocking calls where progress notifications arrive
- `maxTotalTimeout` caps total wait time

**Add new step: Task cleanup on server disconnect**:
- When a server disconnects, mark tracked tasks as unreachable
- On reconnection, re-query task status if server maintains task state
- Tasks are server-side state; if server loses state, tasks are lost

**Add new step: Streamable HTTP resilience**:
- Handle connection drops for HTTP-connected servers
- Session management: store `MCP-Session-Id`, include in subsequent requests
- If session expires (server returns 404), re-initialize connection
- SSE stream reconnection with `Last-Event-ID` for resumability

**Verification** -- add:
- Test task cleanup when server crashes mid-task
- Test HTTP transport reconnection with session ID preservation

---

### 5. `specs/05-advanced.md`

**Step 1 (HTTP transport)** -- major rewrite:
- Use `StreamableHTTPClientTransport` from SDK (replaces old HTTP+SSE description)
- Transport handles: POST for client→server, GET for server SSE stream
- Session management: `MCP-Session-Id` auto-detected and stored
- Protocol version: `MCP-Protocol-Version` header on all requests after init
- Resumability: event IDs + `Last-Event-ID` on reconnection
- Update `HttpServerConfig` type:
  ```
  url, transport (default: 'streamable-http'), headers,
  sessionId (optional), reconnection options (maxDelay, initialDelay, growFactor, maxRetries)
  ```
- Backward compatibility: `transport: "sse"` uses legacy `SSEClientTransport`
- Origin header validation for DNS rebinding protection when running HTTP listener

**Step 2 (HTTP listener)** -- update:
- Keep simple JSON-RPC over HTTP POST for daemon's internal listener (not a full MCP endpoint)
- Note: full MCP proxy mode (Streamable HTTP server) could be a future enhancement
- Origin header validation for security

**Add Step 4: Protocol Version Negotiation**:
- mcpd requests `2025-11-25` as `protocolVersion` during `initialize`
- SDK handles version negotiation/downgrade
- Log negotiated version per server
- Store in server status (visible via `mcpd status`, `mcpd servers`)

**Verification** -- update:
- Test Streamable HTTP transport connection
- Test session ID persistence across reconnections
- Test backward compatibility with SSE-only servers
- Test protocol version negotiation

---

## Verification (End-to-End)

After updating all spec files:
1. Read through each file to ensure internal consistency
2. Verify all new MCP 2025-11-25 features are accounted for in at least one spec file
3. Verify IPC protocol methods in architecture.md match daemon handlers defined in iteration specs
4. Verify CLI commands in architecture.md match command files defined in iteration specs
5. Run `pnpm format:check` (spec files are markdown, just verify no issues)
6. Commit all changes and push to `claude/update-mcp-spec-Ywdss`
