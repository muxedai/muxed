# 06 - `muxed init` Command

## Overview

The `init` command bootstraps muxed by scraping MCP server configurations from known coding agents (both local/repo-level and global/user-level config files), copying discovered servers into the muxed config, and then deleting the original MCP server entries from the source configs.

After running `init`, the user's coding agents will have their MCP servers managed centrally by muxed, and each agent is reconfigured to point at muxed as its sole MCP server instead.

## Behavior

```
muxed init [--dry-run] [--json] [--no-delete] [--no-replace]
```

### Flags

| Flag           | Description                                                 |
| -------------- | ----------------------------------------------------------- |
| `--dry-run`    | Show what would be done without writing any files           |
| `--json`       | Output results as JSON                                      |
| `--no-delete`  | Copy servers to muxed config but don't remove originals     |
| `--no-replace` | Don't inject muxed as a replacement server in agent configs |

### Flow

1. **Discover** – Scan all known agent config file locations (local + global) for MCP server entries
2. **Deduplicate** – Merge discovered servers, handling name collisions (same name + same config → keep one; same name + different config → prefix with agent name)
3. **Write muxed config** – Merge discovered servers into `muxed.config.json` (local) or `~/.config/muxed/config.json` (global), creating the file if it doesn't exist
4. **Replace in agents** – For each agent config that had servers removed, inject a single `muxed` stdio server entry pointing to `npx muxed` (so the agent uses muxed as its MCP proxy)
5. **Delete originals** – Remove the original `mcpServers` / `servers` entries from agent configs (unless `--no-delete`)
6. **Report** – Print summary of what was discovered, merged, and cleaned up

### Which config file gets written

- If run from a repo directory that has any local agent configs (`.cursor/mcp.json`, `.vscode/mcp.json`, `.mcp.json`, etc.), write `./muxed.config.json` (project-local)
- Global agent configs (e.g., `~/.cursor/mcp.json`, Claude Desktop global config) get merged into `~/.config/muxed/config.json`
- If `--config <path>` is provided on the parent command, use that path exclusively

## Agent Config Locations to Scrape

### Local (repo-level) configs

Searched relative to `process.cwd()`:

| Agent       | Path                | Key          | Notes                                       |
| ----------- | ------------------- | ------------ | ------------------------------------------- |
| Claude Code | `.mcp.json`         | `mcpServers` | Project-scoped                              |
| Cursor      | `.cursor/mcp.json`  | `mcpServers` |                                             |
| VS Code     | `.vscode/mcp.json`  | `servers`    | Has `inputs` array, `type` field on entries |
| Roo Code    | `.roo/mcp.json`     | `mcpServers` | Has `alwaysAllow`, `disabled` fields        |
| Amazon Q    | `.amazonq/mcp.json` | `mcpServers` | Has `timeout` field                         |

### Global (user-level) configs

| Agent            | Path (Linux)                                                                                    | Path (macOS)                                                                                                        | Key          | Notes                                          |
| ---------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------ | ---------------------------------------------- |
| Claude Desktop   | `~/.config/Claude/claude_desktop_config.json`                                                   | `~/Library/Application Support/Claude/claude_desktop_config.json`                                                   | `mcpServers` |                                                |
| Cursor           | `~/.cursor/mcp.json`                                                                            | `~/.cursor/mcp.json`                                                                                                | `mcpServers` |                                                |
| Windsurf         | `~/.codeium/windsurf/mcp_config.json`                                                           | `~/.codeium/windsurf/mcp_config.json`                                                                               | `mcpServers` | Uses `serverUrl` for HTTP – normalize to `url` |
| VS Code (global) | `~/.config/Code/User/mcp.json`                                                                  | `~/Library/Application Support/Code/User/mcp.json`                                                                  | `servers`    |                                                |
| Cline            | `~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`     | `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`     | `mcpServers` |                                                |
| Roo Code         | `~/.config/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/cline_mcp_settings.json` | `~/Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/cline_mcp_settings.json` | `mcpServers` |                                                |
| Amazon Q         | `~/.aws/amazonq/mcp.json`                                                                       | `~/.aws/amazonq/mcp.json`                                                                                           | `mcpServers` |                                                |

## Normalization

Each agent stores servers slightly differently. Before merging into muxed config, normalize:

1. **VS Code `servers` → `mcpServers`**: Rename key. Strip `type` field from stdio entries (muxed infers from presence of `command` vs `url`). Keep `type: "sse"` as `transport: "sse"`.
2. **Windsurf `serverUrl`**: Rename to `url`.
3. **Extra fields**: Strip agent-specific fields (`alwaysAllow`, `disabled`, `timeout`, `source`) – these are not relevant to muxed.
4. **`env` with `${input:...}` references** (VS Code): Warn user that these require manual resolution. Keep the env vars but log a warning.

## Deduplication Strategy

When the same server name appears in multiple agent configs:

1. **Identical config** (same `command`+`args` or same `url`): Keep one copy
2. **Different config**: Prefix with agent name to avoid collision (e.g., `cursor-myserver`, `vscode-myserver`) and warn user

## File Modification Strategy

### Writing muxed config

- If the target muxed config file exists, read it, merge new servers (don't overwrite existing entries with same name), write back
- If it doesn't exist, create it with just `{ "mcpServers": { ... } }`
- Preserve any existing `daemon` config section

### Modifying agent configs

- Read the full JSON
- Remove only the `mcpServers` / `servers` entries (leave all other config intact)
- If `--no-replace` is not set, add a single muxed entry so the agent still has MCP access:
  - For `mcpServers`-based agents: `{ "muxed": { "command": "npx", "args": ["muxed@latest", "proxy"] } }`
  - For `servers`-based agents (VS Code): `{ "muxed": { "type": "stdio", "command": "npx", "args": ["muxed@latest", "proxy"] } }`
- Write back with same formatting (detect indent from original file)

### Backup

Before modifying any agent config file, create a `.bak` backup alongside it (e.g., `mcp.json.bak`). This is a safety net in case something goes wrong.

## Implementation Plan

### New files

| File                       | Purpose                                                     |
| -------------------------- | ----------------------------------------------------------- |
| `src/cli/commands/init.ts` | Command definition and orchestration                        |
| `src/core/agents.ts`       | Agent config discovery, reading, normalization, and writing |

### Changes to existing files

| File                   | Change                                       |
| ---------------------- | -------------------------------------------- |
| `src/cli/index.ts`     | Register `initCommand`                       |
| `src/cli/formatter.ts` | Add `formatInit()` for human-readable output |

### Step-by-step

#### 1. `src/core/agents.ts` – Agent config discovery engine

Define a registry of known agents:

```typescript
type AgentDef = {
  name: string; // e.g., "claude-desktop", "cursor", "vscode"
  scope: 'local' | 'global';
  configPath: () => string | null; // returns absolute path or null if N/A for this OS
  serversKey: 'mcpServers' | 'servers'; // which JSON key holds the servers
  normalize?: (servers: Record<string, unknown>) => Record<string, ServerConfig>;
};
```

Functions:

- `getAgentDefs(): AgentDef[]` – Return full list of agent definitions (local + global)
- `discoverAgentConfigs(): DiscoveredConfig[]` – Scan all paths, return found configs with their servers
- `normalizeServers(agent: AgentDef, raw: Record<string, unknown>): Record<string, ServerConfig>` – Strip extra fields, rename keys
- `mergeServers(discovered: DiscoveredConfig[]): { merged: Record<string, ServerConfig>; conflicts: Conflict[] }` – Deduplicate
- `writeAgentConfig(agent: AgentDef, configPath: string, servers: Record<string, ServerConfig> | null, muxedEntry: Record<string, unknown> | null): void` – Modify agent file (remove old servers, optionally add muxed entry)
- `writeMcpdConfig(configPath: string, servers: Record<string, ServerConfig>, existingConfig?: McpdConfig): void` – Write or merge into muxed config

Types:

```typescript
type DiscoveredConfig = {
  agent: AgentDef;
  configPath: string;
  servers: Record<string, ServerConfig>;
  rawServers: Record<string, unknown>; // original for diffing
  otherContent: Record<string, unknown>; // rest of the JSON (preserved on write-back)
};

type Conflict = {
  name: string;
  agents: string[];
  resolution: string; // e.g., "prefixed as cursor-myserver"
};

type InitResult = {
  discovered: Array<{ agent: string; path: string; serverCount: number }>;
  imported: string[]; // server names added to muxed config
  skipped: string[]; // server names already in muxed config
  conflicts: Conflict[];
  warnings: string[]; // e.g., "${input:...} references"
  modifiedFiles: string[]; // agent configs that were modified
  muxedConfigPath: string; // where muxed config was written
};
```

#### 2. `src/cli/commands/init.ts` – Command definition

```typescript
export const initCommand = new Command('init')
  .description('Import MCP servers from coding agents into muxed')
  .option('--dry-run', 'Show what would be done without writing files')
  .option('--json', 'Output as JSON')
  .option('--no-delete', 'Keep original server entries in agent configs')
  .option('--no-replace', "Don't add muxed entry to agent configs")
  .action(async (opts) => {
    // 1. Determine target muxed config path
    // 2. Call discoverAgentConfigs()
    // 3. Call mergeServers()
    // 4. If --dry-run, format and print results, exit
    // 5. Write muxed config
    // 6. Unless --no-delete: modify agent configs (backup + remove servers + add muxed entry)
    // 7. Format and print results
  });
```

#### 3. `src/cli/formatter.ts` – Add `formatInit()`

Human-readable output showing:

- Table of discovered agents with server counts
- List of imported servers
- Any conflicts and how they were resolved
- Warnings (e.g., unresolved `${input:...}`)
- Files modified
- Path to muxed config written

#### 4. `src/cli/index.ts` – Register command

Add import and `program.addCommand(initCommand)`.

## Output Example

```
Discovered MCP servers:

  Agent             Config                          Servers
  ─────             ──────                          ───────
  cursor            .cursor/mcp.json                3
  vscode            .vscode/mcp.json                2
  claude-desktop    ~/.config/Claude/claude...json   4
  cursor (global)   ~/.cursor/mcp.json              1

Imported 8 servers into ./muxed.config.json:
  filesystem, postgres, github, brave-search, memory, slack, linear, sentry

Skipped 2 (already existed):
  filesystem, postgres

Conflicts (resolved by prefixing):
  github → cursor-github, vscode-github

Warnings:
  vscode server "api-service": env references ${input:api-key} – set manually in muxed config

Modified files:
  .cursor/mcp.json (backed up to .cursor/mcp.json.bak)
  .vscode/mcp.json (backed up to .vscode/mcp.json.bak)
  ~/.config/Claude/claude_desktop_config.json (backed up)
  ~/.cursor/mcp.json (backed up)
```

## Edge Cases

1. **No agent configs found** – Print "No MCP server configurations found in any known agent config files." and exit cleanly
2. **muxed config already exists with all servers** – Print "All discovered servers already exist in muxed config. Nothing to do."
3. **Agent config file is malformed JSON** – Warn and skip that file, continue with others
4. **Agent config file has no servers** – Skip silently
5. **Permission errors reading/writing files** – Warn per file, continue with others
6. **Circular reference** – If an agent config already has an muxed entry, skip it (don't import muxed into muxed)
7. **Empty servers after normalization** – Skip that agent
