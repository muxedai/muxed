# JS/TS API

> Make `toold` consumable as a library from JavaScript/TypeScript scripts, not just the CLI.

## Motivation

The CLI is great for agents and shell scripts, but JS/TS users need a programmatic interface. They shouldn't have to shell out to `toold call` or speak JSON-RPC over a Unix socket manually. A proper API lets them:

- Call MCP tools from Node.js scripts, test suites, and servers
- Get typed results without JSON parsing
- Compose tool calls with normal async/await control flow
- Build higher-level abstractions on top of the daemon

## Design Principles

1. **Thin client** — the API is a typed wrapper over the daemon's JSON-RPC socket. No MCP protocol logic lives in the client; the daemon owns all connections.
2. **Auto-start** — calling `connect()` lazily starts the daemon if not running, same as the CLI.
3. **1:1 with daemon methods** — every JSON-RPC method the daemon exposes gets a corresponding typed method. No hidden magic.
4. **Zero new dependencies** — the client uses `node:net` (already used by `cli/client.ts`). Types come from `@modelcontextprotocol/sdk/types.js` which is already a dependency.
5. **Separate entry point** — the API ships as `toold/client` (or `toold`), distinct from the CLI bundle. The CLI remains the `toold` bin; the library is an importable module.

## Public API

### Entry Point

```ts
import { createClient } from 'toold';

const client = await createClient();
// or with options:
const client = await createClient({ configPath: './toold.config.json' });
```

`createClient` ensures the daemon is running (auto-starts if needed), connects to the Unix socket, and returns a `McpdClient` instance.

### `CreateClientOptions`

```ts
type CreateClientOptions = {
  /** Path to toold.config.json. Uses default resolution if omitted. */
  configPath?: string;

  /** Skip auto-starting the daemon. Throws if daemon is not running. */
  autoStart?: boolean; // default: true
};
```

### `McpdClient`

```ts
interface McpdClient {
  // --- Servers ---
  servers(): Promise<ServerState[]>;

  // --- Tools ---
  tools(server?: string): Promise<Array<{ server: string; tool: Tool }>>;
  tool(name: string): Promise<Tool>;
  grep(pattern: string): Promise<Array<{ server: string; tool: Tool }>>;
  call(name: string, args?: Record<string, unknown>, options?: CallOptions): Promise<CallResult>;
  callAsync(name: string, args?: Record<string, unknown>): Promise<TaskHandle>;

  // --- Resources ---
  resources(server?: string): Promise<Array<{ server: string; resource: Resource }>>;
  read(server: string, uri: string): Promise<ReadResourceResult>;

  // --- Prompts ---
  prompts(server?: string): Promise<Array<{ server: string; prompt: Prompt }>>;
  prompt(server: string, name: string, args?: Record<string, string>): Promise<GetPromptResult>;

  // --- Completions ---
  complete(
    server: string,
    ref: { type: string; name: string; uri?: string },
    argument: { name: string; value: string }
  ): Promise<CompleteResult>;

  // --- Tasks ---
  tasks(server?: string): Promise<Array<{ server: string; tasks: Array<Record<string, unknown>> }>>;
  task(server: string, taskId: string): Promise<TaskStatus>;
  taskResult(server: string, taskId: string): Promise<TaskResult>;
  taskCancel(server: string, taskId: string): Promise<TaskCancelResult>;

  // --- Daemon ---
  status(): Promise<DaemonStatus>;
  reload(configPath?: string): Promise<ReloadResult>;
  stop(): Promise<void>;

  // --- Lifecycle ---
  close(): void;
}
```

### Types

```ts
// Re-exported from @modelcontextprotocol/sdk/types.js
export type { Tool, Resource, Prompt, Implementation, ServerCapabilities };

// From core/types.ts (already defined)
export type { ServerState, ServerConfig, StdioServerConfig, HttpServerConfig, DaemonConfig };

// Call options
type CallOptions = {
  /** Request timeout in milliseconds. */
  timeout?: number;
};

// Tool call result
type CallResult = {
  content: Array<{
    type: string;
    text?: string;
    mimeType?: string;
    data?: string;
    name?: string;
    uri?: string;
    resource?: { text?: string; blob?: string; mimeType?: string };
  }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

// Async task handle
type TaskHandle = {
  taskId: string;
  server: string;
  status: string;
};

// Daemon status
type DaemonStatus = {
  pid: number;
  uptime: number;
  serverCount: number;
  servers: ServerState[];
};

// Config reload result
type ReloadResult = {
  added: string[];
  removed: string[];
  changed: string[];
};
```

`ReadResourceResult`, `GetPromptResult`, `CompleteResult`, `TaskStatus`, `TaskResult`, and `TaskCancelResult` are the raw return types from the MCP SDK, passed through unchanged from the daemon.

## Usage Examples

### List tools and call one

```ts
import { createClient } from 'toold';

const toold = await createClient();

const tools = await toold.tools();
console.log(`Found ${tools.length} tools`);

const result = await toold.call('filesystem/read_file', {
  path: '/etc/hostname',
});

console.log(result.content[0]?.text);
toold.close();
```

### Search and invoke

```ts
const toold = await createClient();

const matches = await toold.grep('search');
for (const { server, tool } of matches) {
  console.log(`${server}/${tool.name}: ${tool.description}`);
}
```

### Async tasks

```ts
const toold = await createClient();

const handle = await toold.callAsync('server/long-running-tool', { input: 'data' });
console.log(`Task started: ${handle.taskId}`);

// Poll for completion
let status = await toold.task(handle.server, handle.taskId);
while (status.status !== 'completed' && status.status !== 'failed') {
  await new Promise((r) => setTimeout(r, 1000));
  status = await toold.task(handle.server, handle.taskId);
}

const result = await toold.taskResult(handle.server, handle.taskId);
```

### Error handling

```ts
import { createClient, McpdError } from 'toold';

const toold = await createClient();
try {
  await toold.call('server/nonexistent-tool');
} catch (err) {
  if (err instanceof McpdError) {
    console.error(`RPC error ${err.code}: ${err.message}`);
  }
}
```

## Error Types

```ts
class McpdError extends Error {
  readonly code: number;
  readonly data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.code = code;
    this.data = data;
  }
}
```

The client throws `McpdError` for JSON-RPC errors returned by the daemon (tool not found, server not found, etc.). Standard `Error` is thrown for transport-level failures (daemon not running, socket errors).

## Implementation

### File Structure

```
src/
  client/
    index.ts          # createClient(), McpdClient class, McpdError, type re-exports
```

Single file. The client is simple — it wraps `ensureDaemon()` + `sendRequest()` (already in `cli/client.ts`) with typed methods. The socket logic from `cli/client.ts` gets extracted into a shared module both the CLI and the library client can use.

### Refactor Plan

1. **Extract socket logic** from `src/cli/client.ts` into `src/client/socket.ts`:
   - `ensureDaemon(configPath?)` — unchanged
   - `sendRequest(method, params?)` — unchanged
   - These become shared between CLI commands and the library client

2. **Create `src/client/index.ts`** — the public API:
   - `createClient(options?)` — calls `ensureDaemon()`, returns `McpdClient`
   - `McpdClient` class — typed methods that delegate to `sendRequest()`
   - `McpdError` class — wraps JSON-RPC errors
   - Re-exports types from `core/types.ts` and `@modelcontextprotocol/sdk/types.js`

3. **Update CLI commands** to import from `src/client/socket.ts` instead of `src/cli/client.ts`

4. **Add package.json exports**:
   ```json
   {
     "exports": {
       ".": {
         "import": "./dist/client.mjs",
         "types": "./dist/client.d.mts"
       },
       "./client": {
         "import": "./dist/client.mjs",
         "types": "./dist/client.d.mts"
       }
     }
   }
   ```

5. **Update build.config.mjs** to produce two bundles:
   - `dist/cli.mjs` — the CLI (existing)
   - `dist/client.mjs` + `dist/client.d.mts` — the library (new, with type declarations)

6. **Update `files` in package.json** to include `dist` (already does)

### Implementation Details

The `McpdClient` class is thin:

```ts
class McpdClient {
  private sendRequest: (method: string, params?: Record<string, unknown>) => Promise<unknown>;

  async call(name: string, args?: Record<string, unknown>, options?: CallOptions): Promise<CallResult> {
    return await this.sendRequest('tools/call', {
      name,
      arguments: args ?? {},
      ...(options?.timeout ? { timeout: options.timeout } : {}),
    }) as CallResult;
  }

  async tools(server?: string): Promise<Array<{ server: string; tool: Tool }>> {
    return await this.sendRequest('tools/list', server ? { server } : undefined) as ...;
  }

  // ... same pattern for all methods
}
```

Each method is 1-5 lines: build params, call `sendRequest`, cast the result. No business logic.

### Type Generation

The library needs `.d.mts` type declarations. Options:

- **obuild `declaration: true`** — if supported, simplest approach
- **tsc `--emitDeclarationOnly`** — run as a separate build step targeting just `src/client/index.ts`

Either way, the types are derived from the source. No manual `.d.ts` files.

## Testing

```ts
// src/client/index.test.ts
import { describe, it, expect, vi } from 'vitest';

// Mock the socket layer
vi.mock('./socket.js', () => ({
  ensureDaemon: vi.fn(),
  sendRequest: vi.fn(),
}));

describe('McpdClient', () => {
  it('tools() calls tools/list', async () => {
    const { sendRequest } = await import('./socket.js');
    (sendRequest as any).mockResolvedValue([{ server: 'fs', tool: { name: 'read' } }]);

    const client = await createClient();
    const tools = await client.tools();
    expect(sendRequest).toHaveBeenCalledWith('tools/list', undefined);
    expect(tools).toHaveLength(1);
  });

  it('call() passes arguments and timeout', async () => {
    const { sendRequest } = await import('./socket.js');
    (sendRequest as any).mockResolvedValue({ content: [] });

    const client = await createClient();
    await client.call('server/tool', { key: 'value' }, { timeout: 5000 });
    expect(sendRequest).toHaveBeenCalledWith('tools/call', {
      name: 'server/tool',
      arguments: { key: 'value' },
      timeout: 5000,
    });
  });

  it('wraps JSON-RPC errors in McpdError', async () => {
    // sendRequest already throws Error for JSON-RPC errors
    // Test that McpdError is thrown with code/data
  });
});
```

## Iteration Plan

1. Extract socket logic into shared module
2. Implement `McpdClient` with all typed methods
3. Wire up build for library entry point + type declarations
4. Update package.json exports
5. Add tests
6. Update CLI commands to use shared socket module
