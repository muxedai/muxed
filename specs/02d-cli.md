# Iteration 2d: CLI (Client, Formatter, Commands, Entry Point)

## Goal

Implement the CLI layer: a thin client that connects to the daemon socket, sends JSON-RPC requests, formats output for humans or JSON, and wires up Commander with the core commands (`servers`, `tools`, `info`, `call`, `stop`, `status`).

## Prerequisites

Iteration 2c (daemon) complete.

## Steps

### 1. CLI client (`src/cli/client.ts`)

Handles daemon communication from the CLI side.

**`ensureDaemon(configPath?: string): Promise<void>`**
- Call `isDaemonRunning()`
- If not running: call `cleanupStaleFiles()` then `daemonize(configPath)`
- Retry socket connection with short backoff (100ms, 200ms, 400ms) to wait for daemon readiness

**`sendRequest(method: string, params?: object): Promise<unknown>`**
- Connect to Unix socket at `getSocketPath()`
- Send JSON-RPC 2.0 request (JSON + newline)
- Read response (buffer until newline)
- Parse JSON-RPC response
- If response has `error`: throw an error with the message
- If response has `result`: return it
- Close connection after each request (short-lived connections)

**Error handling:**
- Socket not found → suggest running `mcpd status` to check
- Connection refused → daemon may have crashed, suggest restart
- Timeout → suggest `--timeout` flag or check server health

### 2. CLI formatter (`src/cli/formatter.ts`)

Formats daemon responses for human-readable CLI output. All formatters accept the raw data and return a string. The CLI commands handle writing to stdout.

**`formatServers(servers: ServerState[]): string`**
- Table with columns: Name, Title, Status, Protocol
- `title` from serverInfo (if available), otherwise `—`
- Status: connected/error/closed with appropriate styling
- Protocol: negotiated protocolVersion

**`formatTools(tools: Array<{ server: string; tool: Tool }>): string`**
- Table with columns: Tool, Title, Description, Hints
- Tool: `server/name`
- Title: `tool.title` or `—`
- Description: truncated to ~60 chars
- Hints: tags like `[read-only]`, `[destructive]`, `[idempotent]` from `annotations`

**`formatToolInfo(server: string, tool: Tool): string`**
- Detailed view:
  ```
  server/toolName
  Title: ...
  Description: ...

  Input Schema:
    <formatted JSON schema>

  Output Schema:          (if present)
    <formatted JSON schema>

  Annotations:
    readOnlyHint: true    (only show truthy values)
    destructiveHint: true

  Task Support: optional  (if execution.taskSupport present)
  ```

**`formatCallResult(result: CallToolResult): string`**
- Iterate over `result.content` array, format each block:
  - `type: "text"` → output `text` directly
  - `type: "image"` → `[Image: ${mimeType}]`
  - `type: "audio"` → `[Audio: ${mimeType}]`
  - `type: "resource_link"` → `Resource: ${name} (${uri})`
  - `type: "resource"` → if text: show text; if blob: `[Binary: ${mimeType}]`
- If `result.structuredContent` is present, append:
  ```
  Structured Output:
    <formatted JSON>
  ```
- If `result.isError` is true, prefix with `Error: `

**`formatStatus(status: DaemonStatus): string`**
- Show: PID, uptime (human-readable), server count
- Then per-server summary: name, title, status, capabilities list

**`formatJson(data: unknown): string`**
- `JSON.stringify(data, null, 2)` — used for all `--json` output

### 3. CLI commands

Each command in `src/cli/commands/`. Every command (except `stop`) calls `ensureDaemon()` first.

**`servers.ts`** — `mcpd servers [--json]`
- `ensureDaemon()`
- `sendRequest('servers/list')`
- Output: `formatServers()` or `formatJson()`

**`tools.ts`** — `mcpd tools [server] [--json]`
- `ensureDaemon()`
- `sendRequest('tools/list', { server })` (server is optional)
- Output: `formatTools()` or `formatJson()`

**`info.ts`** — `mcpd info <server/tool> [--json]`
- `ensureDaemon()`
- `sendRequest('tools/info', { name: serverTool })`
- Output: `formatToolInfo()` or `formatJson()`

**`call.ts`** — `mcpd call <server/tool> [json] [--timeout ms]`
- `ensureDaemon()`
- Parse JSON args from positional argument (or `-` for stdin — just note this, stdin is added in iteration 3)
- `sendRequest('tools/call', { name: serverTool, arguments: parsedArgs })`
- Output: `formatCallResult()` or `formatJson()`
- Support `--timeout` flag passed through to daemon

**`stop.ts`** — `mcpd stop`
- Try `sendRequest('daemon/stop')`
- If socket not found: report "Daemon is not running"
- On success: report "Daemon stopped"
- Do NOT call `ensureDaemon()` — that would start one just to stop it

**`status.ts`** — `mcpd status [--json]`
- First check `isDaemonRunning()`. If not running: report "Daemon is not running" and exit
- If running: `sendRequest('daemon/status')`
- Output: `formatStatus()` or `formatJson()`
- Do NOT call `ensureDaemon()` — status should report whether daemon is up, not start one

### 4. CLI entry point (`src/cli/index.ts`)

Wire up Commander:
```typescript
const program = new Command();
program.name('mcpd').description('MCP Server Proxy/Aggregator').version('0.1.0');
program.option('--config <path>', 'Path to config file');

// Register subcommands
program.addCommand(serversCommand);
program.addCommand(toolsCommand);
program.addCommand(infoCommand);
program.addCommand(callCommand);
program.addCommand(stopCommand);
program.addCommand(statusCommand);

program.parse();
```

Pass `--config` option through to `ensureDaemon()` calls.

### 5. Main entry (`src/cli.ts`)

Update the existing placeholder:
```typescript
if (process.argv.includes('--daemon')) {
  // Daemon mode (forked by daemonize())
  const configPath = /* extract --config from argv */;
  startDaemon(configPath);
} else {
  // CLI mode
  runCli();
}
```

## Verification

1. `pnpm build` succeeds
2. `pnpm type-check` passes
3. End-to-end: create `mcpd.config.json` in project root:
   ```json
   {
     "mcpServers": {
       "everything": {
         "command": "npx",
         "args": ["-y", "@modelcontextprotocol/server-everything"]
       }
     }
   }
   ```
4. `node bin/cli.mjs servers` → auto-starts daemon, shows "everything" as connected with server title and protocolVersion
5. `node bin/cli.mjs tools` → lists tools with titles and annotation tags
6. `node bin/cli.mjs tools everything` → lists tools filtered to "everything" server
7. `node bin/cli.mjs info everything/echo` → shows echo tool schema with inputSchema, annotations
8. `node bin/cli.mjs call everything/echo '{"message":"hello"}'` → returns text result
9. `node bin/cli.mjs status` → shows daemon running with per-server capabilities
10. `node bin/cli.mjs servers --json` → outputs full JSON with serverInfo, capabilities
11. `node bin/cli.mjs tools --json` → outputs full JSON with icons, annotations, outputSchema
12. `node bin/cli.mjs stop` → daemon shuts down, socket + PID files removed
13. `node bin/cli.mjs stop` again → reports "Daemon is not running"
14. `pnpm test` passes
