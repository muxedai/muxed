# Iteration 2b: MCP Connection (ServerManager, ServerPool)

## Goal

Implement the MCP client layer that connects to upstream MCP servers, negotiates capabilities, and provides methods to list tools and call them. This is the core MCP integration using `@modelcontextprotocol/sdk`.

## Prerequisites

Iteration 2a (foundation) complete.

## Steps

### 1. Server Manager (`src/core/server-manager.ts`)

Wraps a single MCP server connection. One instance per configured server.

**Constructor:**
- Takes `name: string` and `config: ServerConfig`
- Initializes internal state: `status`, `serverInfo`, `capabilities`, `protocolVersion`, `tools` cache

**`connect(connectTimeout?: number): Promise<void>`**
- Create transport based on config type:
  - `StdioServerConfig` → `StdioClientTransport` with `{ command, args, env, cwd }` from config. The SDK spawns the child process.
  - `HttpServerConfig` → `StreamableHTTPClientTransport` with `{ url }` from config. Pass custom `headers` via `requestInit` if present.
- Create SDK `Client` with:
  - `Implementation` info: `{ name: 'toold', version: '<read from package.json or hardcode>' }`
  - Client capabilities: `{ tasks: { list: {}, cancel: {} } }` — explicitly no `sampling`, `elicitation`, or `roots`
- Call `client.connect(transport)` which performs the `initialize` handshake
  - This requests protocol version `2025-11-25`
- After successful connect, store:
  - `client.getServerCapabilities()` → `this.capabilities`
  - `client.getServerVersion()` → `this.serverInfo` (Implementation with name, version, title, description, icons, websiteUrl)
  - Negotiated `protocolVersion` from the initialize response
- Set `status = 'connected'`
- Call `refreshTools()` to populate the tools cache
- Register `listChanged` notification handler on the client to auto-refresh tools cache when the server signals changes
- Register `transport.onclose` handler → set `status = 'closed'`
- On error during connect: set `status = 'error'`, store error message, do NOT throw (caller decides retry policy)

**`disconnect(): Promise<void>`**
- Call `client.close()` which closes transport and cleans up
- Set `status = 'closed'`

**`listTools(): Tool[]`**
- Return cached tools array (full SDK `Tool` objects including title, icons, outputSchema, annotations, execution)

**`refreshTools(): Promise<void>`** (private)
- Call `client.listTools()` (handles pagination internally in the SDK)
- Store full `Tool` objects in cache

**`callTool(name: string, args: Record<string, unknown>, timeout?: number): Promise<CallToolResult>`**
- Delegate to `client.callTool({ name, arguments: args })` with optional timeout via `AbortSignal.timeout()`
- Return the full SDK `CallToolResult` — includes `content` array (text, image, audio, resource_link, resource types) and optional `structuredContent`
- Do NOT filter or transform the result — pass through as-is

**`getStatus(): ServerConnectionStatus`**
- Return current status

**`getState(): ServerState`**
- Return full state object: name, config, status, error, serverInfo, capabilities, protocolVersion, instructions

### 2. Server Pool (`src/core/server-pool.ts`)

Manages all `ServerManager` instances. Single instance per daemon.

**`connectAll(config: McpdConfig): Promise<void>`**
- Create one `ServerManager` per entry in `config.mcpServers`
- Connect all in parallel with `Promise.allSettled()` (don't fail if some servers fail to connect)
- Log results: which connected, which failed

**`disconnectAll(): Promise<void>`**
- Disconnect all managers in parallel

**`getServer(name: string): ServerManager | undefined`**
- Get a specific server manager by name

**`listServers(): ServerState[]`**
- Return `getState()` from each manager

**`listAllTools(server?: string): Array<{ server: string; tool: Tool }>`**
- If `server` is specified, return tools from that server only
- Otherwise, aggregate tools from all connected servers
- Each entry includes the server name and the full `Tool` object
- Tools are identified as `server/toolName` in the CLI layer (not here — this returns raw data)

**`findTool(serverTool: string): { manager: ServerManager; tool: Tool } | undefined`**
- Parse `server/tool` string (split on first `/`)
- Find the manager, then find the tool in its cache
- Return both for the caller to use

## Verification

1. `pnpm type-check` passes
2. Integration test: create a `ServerManager` with `@modelcontextprotocol/server-everything` config, call `connect()`, verify `status === 'connected'`
3. Integration test: after connect, `getState()` returns `serverInfo` with name and version, `capabilities` with tools/resources, `protocolVersion` of `2025-11-25`
4. Integration test: `listTools()` returns an array of `Tool` objects with `name`, `inputSchema`, and optionally `title`, `annotations`
5. Integration test: `callTool('echo', { message: 'hello' })` returns a result with `content` containing a text block
6. Integration test: `disconnect()` sets status to `closed`
7. Integration test: `ServerPool.connectAll()` with one valid server succeeds, `listServers()` shows it as connected
8. Integration test: `ServerPool.listAllTools()` aggregates tools with server names
9. Integration test: `ServerPool.findTool('everything/echo')` returns the correct manager and tool
10. `pnpm test` passes
