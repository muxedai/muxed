# Iteration 3: Complete CLI

## Goal

Add remaining CLI commands and polish the interface: `grep`, `resources`, `read`, `reload`, `prompts`, `prompt`, `completions`, task commands, stdin support for `call`, `--async` flag, and `--json` flags everywhere.

## Prerequisites

Iteration 2d (CLI) complete — full MVP is operational.

## Steps

### 1. `grep` command (`src/cli/commands/grep.ts`)

- Accept a regex pattern argument
- Send `tools/grep` to daemon
- Daemon searches tool names, titles, and descriptions across all servers
- Display matching tools with server prefix, title, and description

### 2. `resources` command (`src/cli/commands/resources.ts`)

- Optional server filter argument
- Send `resources/list` to daemon
- Daemon calls `client.listResources()` on each server (or filtered server)
- Display resources with `server/resource` naming, including `title`, `description`, `mimeType`, `annotations` (audience, priority, lastModified)

### 3. `read` command (`src/cli/commands/read.ts`)

- Accept `server/resource` argument and optional URI
- Send `resources/read` to daemon
- Daemon calls `client.readResource()` on the target server
- Display resource contents (text directly, binary as `[Binary: mimeType, size bytes]`)

### 4. `reload` command (`src/cli/commands/reload.ts`)

- Send `config/reload` to daemon
- Daemon re-reads config file
- Diff against current config: disconnect removed servers, connect new ones, reconnect changed ones
- Report what changed

### 5. `prompts` command (`src/cli/commands/prompts.ts`)

- Optional server filter argument
- Send `prompts/list` to daemon
- Daemon calls `client.listPrompts()` on each server (or filtered server)
- Display prompts with `server/name` naming, including `title`, `description`, argument count
- Support `--json` output with full prompt objects (including icons)

### 6. `prompt` command (`src/cli/commands/prompt.ts`)

- Accept `server/prompt` argument and optional JSON args
- Send `prompts/get` to daemon
- Daemon calls `client.getPrompt()` on the target server
- Display prompt messages with all content types (text, image, audio, embedded resources)
- Support `--json` output

### 7. `completions` command (`src/cli/commands/completions.ts`)

- Accept ref type (`prompt` or `resource`), name, argument name, and partial value
- Send `completions/complete` to daemon
- Daemon calls `client.complete()` on the target server (check server capabilities for `completions` first)
- Display completion values
- Support `--json` output

### 8. Task commands

**`tasks` command** (`src/cli/commands/tasks.ts`):
- Optional server filter argument
- Send `tasks/list` to daemon
- Display: taskId, status (working/completed/failed/cancelled/input_required), server name
- Support `--json` output

**`task` command** (`src/cli/commands/task.ts`):
- Accept `<taskId>` argument
- Send `tasks/get` to daemon
- Display task status, progress info (including `message` field if present)
- Support `--json` output

**`task-result` command** (`src/cli/commands/task-result.ts`):
- Accept `<taskId>` argument
- Send `tasks/result` to daemon
- Display task result (same formatting as `call` output — all content types + structuredContent)
- Support `--json` output

**`task-cancel` command** (`src/cli/commands/task-cancel.ts`):
- Accept `<taskId>` argument
- Send `tasks/cancel` to daemon
- Confirm cancellation, display final task state

### 9. Update `call` command with `--async` and task support

Update `src/cli/commands/call.ts`:
- Add `--async` flag for task-based execution
- For tools with `execution.taskSupport: "required"`: automatically use task mode
  - Without `--async`: block and poll until completion, showing progress (with `message` field)
  - With `--async`: return task handle immediately: `Task created: <taskId> (status: working)`
- For tools with `execution.taskSupport: "optional"`: use task mode only with `--async`
- For tools without task support or `"forbidden"`: standard synchronous call. `--async` flag is ignored with a warning.
- Display `structuredContent` in output when present alongside unstructured content

### 10. stdin support for `call`

Update `src/cli/commands/call.ts`:
- When args is `-`, read JSON from stdin
- Pipe stdin to JSON.parse, then proceed as normal

### 11. `--json` flag on all listing commands

Ensure `servers`, `tools`, `info`, `grep`, `resources`, `prompts`, `completions`, `tasks`, `task`, `task-result`, `status` all support `--json`:
- When `--json` is set, output raw JSON from daemon response (preserving all fields: icons, annotations, etc.)
- When not set, use human-readable formatter

### 12. Add daemon-side handlers

Add to `src/daemon/server.ts`:
- `tools/grep` handler: regex match against tool names, titles, and descriptions
- `resources/list` handler: aggregate resources from all servers (with title, icons, annotations)
- `resources/read` handler: delegate to specific server
- `prompts/list` handler: aggregate prompts from all servers (with title, icons)
- `prompts/get` handler: delegate to specific server
- `completions/complete` handler: delegate to specific server (check server capabilities for `completions`)
- `tasks/list` handler: aggregate tasks across servers
- `tasks/get` handler: delegate to specific server (route by server prefix)
- `tasks/result` handler: delegate to specific server
- `tasks/cancel` handler: delegate to specific server
- `config/reload` handler: reload config, diff, reconnect

### 13. Add to server-pool

Update `src/core/server-pool.ts`:
- `listAllResources(server?)`: aggregate resources with server prefix, preserving title, icons, annotations
- `readResource(server, uri)`: delegate to specific server
- `listAllPrompts(server?)`: aggregate prompts with server prefix, preserving title, icons
- `getPrompt(server, name, args)`: delegate to specific server
- `complete(server, ref, argument)`: delegate to specific server
- `listAllTasks(server?)`: aggregate tasks across servers
- `getTask(server, taskId)`: delegate to specific server
- `getTaskResult(server, taskId)`: delegate to specific server
- `cancelTask(server, taskId)`: delegate to specific server
- `reload(newConfig)`: diff and reconnect

### 14. Add to server-manager

Update `src/core/server-manager.ts`:
- `listResources()`: return full SDK Resource objects (with title, icons, annotations). Cache and refresh on connect and `listChanged`.
- `readResource(uri)`: delegate to `client.readResource()`
- `listPrompts()`: return full SDK Prompt objects (with title, icons). Cache and refresh on connect and `listChanged`.
- `getPrompt(name, args)`: delegate to `client.getPrompt()`
- `complete(ref, argument)`: delegate to `client.complete()`. Check server capabilities for `completions` before calling.
- `listTasks(cursor?)`: delegate to task API. Check server capabilities for `tasks` before calling.
- `getTask(taskId)`: delegate to task API
- `getTaskResult(taskId)`: delegate to task API
- `cancelTask(taskId)`: delegate to task API
- `callToolWithTask(name, args)`: create task-augmented tool call for `--async` mode

## Verification

1. `node bin/cli.mjs grep echo` → finds echo-related tools (matches name, title, description)
2. `node bin/cli.mjs resources` → lists resources with title, annotations
3. `node bin/cli.mjs read everything/someResource` → reads resource content
4. `node bin/cli.mjs prompts` → lists prompts with title, argument count
5. `node bin/cli.mjs prompt everything/somePrompt '{"arg":"value"}'` → renders prompt messages
6. `echo '{"message":"hi"}' | node bin/cli.mjs call everything/echo -` → works via stdin
7. `node bin/cli.mjs tools --json` → outputs full JSON with icons, annotations, outputSchema
8. `node bin/cli.mjs servers --json` → outputs JSON with serverInfo, capabilities
9. `node bin/cli.mjs call everything/longRunningTool --async` → returns task handle
10. `node bin/cli.mjs tasks` → lists active tasks
11. `node bin/cli.mjs task <taskId>` → shows task status with progress message
12. `node bin/cli.mjs task-result <taskId>` → shows completed task result
13. `node bin/cli.mjs task-cancel <taskId>` → cancels task
14. Modify `toold.config.json`, run `node bin/cli.mjs reload` → picks up changes
15. `pnpm type-check` passes
16. `pnpm test` passes
