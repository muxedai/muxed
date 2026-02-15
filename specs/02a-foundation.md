# Iteration 2a: Foundation (Types, Config, Paths)

## Goal

Define the shared type system, configuration loader, and file path utilities that all subsequent layers depend on. These are pure data definitions and utility functions with no runtime behavior.

## Prerequisites

Iteration 1 (project setup) complete.

## Steps

### 1. Core types (`src/core/types.ts`)

Import SDK types directly where possible:
```typescript
import type { Tool, Resource, Prompt, Implementation, ServerCapabilities } from '@modelcontextprotocol/sdk/types.js';
```

Define shared config and status types:

```typescript
// Server configuration variants
type StdioServerConfig = {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
};

type HttpServerConfig = {
  url: string;
  transport?: 'streamable-http' | 'sse'; // default: 'streamable-http'
  headers?: Record<string, string>;
};

type ServerConfig = StdioServerConfig | HttpServerConfig;

// Daemon configuration
type DaemonConfig = {
  idleTimeout?: number;    // default: 300000 (5 min)
  connectTimeout?: number; // default: 30000 (30s)
  requestTimeout?: number; // default: 60000 (60s)
};

// Top-level config
type McpdConfig = {
  mcpServers: Record<string, ServerConfig>;
  daemon?: DaemonConfig;
};

// Runtime server status
type ServerConnectionStatus = 'connecting' | 'connected' | 'error' | 'closed';

// Full server info stored after handshake
type ServerState = {
  name: string;
  config: ServerConfig;
  status: ServerConnectionStatus;
  error?: string;
  serverInfo?: Implementation;      // name, version, title, description, icons, websiteUrl
  capabilities?: ServerCapabilities; // tools, resources, prompts, logging, completions, tasks
  protocolVersion?: string;          // negotiated protocol version
  instructions?: string;             // optional server instructions
};
```

Export a type guard to distinguish config types:
```typescript
function isStdioConfig(config: ServerConfig): config is StdioServerConfig;
function isHttpConfig(config: ServerConfig): config is HttpServerConfig;
```

Note: The SDK's `Tool` type already includes `title`, `icons`, `outputSchema`, `annotations` (readOnlyHint, destructiveHint, idempotentHint, openWorldHint), and `execution` (taskSupport). The SDK's `Resource` type includes `title`, `size`, `icons`, `annotations` (audience, priority, lastModified). The SDK's `Prompt` type includes `title`, `icons`. Use these types directly — do not redefine them.

### 2. Config loader (`src/core/config.ts`)

- Search for config file in order:
  1. Explicit path (if passed via `--config` flag)
  2. `mcpd.config.json` in CWD
  3. `~/.config/mcpd/config.json`
- Validate with Zod schema matching the `McpdConfig` type
- Validate each server config: `StdioServerConfig` must have `command`, `HttpServerConfig` must have `url`
- Apply defaults for `DaemonConfig` fields
- Export `loadConfig(configPath?: string): McpdConfig`
- Throw clear error if no config file found or validation fails

### 3. Paths utility (`src/utils/paths.ts`)

- `getSocketPath()` → `~/.mcpd/mcpd.sock`
- `getPidPath()` → `~/.mcpd/mcpd.pid`
- `getLogPath()` → `~/.mcpd/mcpd.log`
- `getMcpdDir()` → `~/.mcpd/`
- `ensureMcpdDir()` → create `~/.mcpd/` if it doesn't exist (use `fs.mkdirSync` with `recursive: true`)

All paths use `os.homedir()` to resolve `~`.

## Verification

1. `pnpm type-check` passes
2. Unit test: `loadConfig()` loads a valid `mcpd.config.json` and returns parsed config
3. Unit test: `loadConfig()` throws on missing config file
4. Unit test: `loadConfig()` throws on invalid config (missing `command` for stdio server, missing `url` for HTTP server)
5. Unit test: `loadConfig()` applies daemon defaults
6. Unit test: `isStdioConfig()` and `isHttpConfig()` correctly distinguish configs
7. Unit test: `getSocketPath()`, `getPidPath()`, `getLogPath()` return correct paths
8. Unit test: `ensureMcpdDir()` creates the directory
9. `pnpm test` passes
