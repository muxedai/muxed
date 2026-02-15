# Iteration 3: Complete CLI

## Goal

Add remaining CLI commands and polish the interface: `grep`, `resources`, `read`, `reload`, stdin support for `call`, and `--json` flags everywhere.

## Prerequisites

Iteration 2 (MVP) complete.

## Steps

### 1. `grep` command (`src/cli/commands/grep.ts`)

- Accept a regex pattern argument
- Send `tools/grep` to daemon
- Daemon searches tool names and descriptions across all servers
- Display matching tools with server prefix and description

### 2. `resources` command (`src/cli/commands/resources.ts`)

- Optional server filter argument
- Send `resources/list` to daemon
- Daemon calls `client.listResources()` on each server (or filtered server)
- Display resources with `server/resource` naming

### 3. `read` command (`src/cli/commands/read.ts`)

- Accept `server/resource` argument and optional URI
- Send `resources/read` to daemon
- Daemon calls `client.readResource()` on the target server
- Display resource contents

### 4. `reload` command (`src/cli/commands/reload.ts`)

- Send `config/reload` to daemon
- Daemon re-reads config file
- Diff against current config: disconnect removed servers, connect new ones, reconnect changed ones
- Report what changed

### 5. Add daemon-side handlers

Add to `src/daemon/server.ts`:
- `tools/grep` handler: regex match against tool names + descriptions
- `resources/list` handler: aggregate resources from all servers
- `resources/read` handler: delegate to specific server
- `config/reload` handler: reload config, diff, reconnect

Update `src/core/server-pool.ts`:
- `listAllResources(server?)`: aggregate resources with server prefix
- `readResource(server, uri)`: delegate to specific server
- `reload(newConfig)`: diff and reconnect

Update `src/core/server-manager.ts`:
- `listResources()`: return cached resources
- `readResource(uri)`: delegate to `client.readResource()`

### 6. stdin support for `call`

Update `src/cli/commands/call.ts`:
- When args is `-`, read JSON from stdin
- Pipe stdin to JSON.parse, then proceed as normal

### 7. `--json` flag on all listing commands

Ensure `servers`, `tools`, `info`, `grep`, `resources`, `status` all support `--json`:
- When `--json` is set, output raw JSON from daemon response
- When not set, use human-readable formatter

## Verification

1. `node bin/cli.mjs grep echo` → finds echo-related tools
2. `node bin/cli.mjs resources` → lists resources (if server provides any)
3. `node bin/cli.mjs read everything/someResource` → reads resource content
4. `echo '{"message":"hi"}' | node bin/cli.mjs call everything/echo -` → works via stdin
5. `node bin/cli.mjs tools --json` → outputs JSON array
6. `node bin/cli.mjs servers --json` → outputs JSON
7. Modify `mcpd.config.json`, run `node bin/cli.mjs reload` → picks up changes
8. `pnpm type-check` passes
9. `pnpm test` passes
