# Project overview

Muxed is an MCP (Model Context Protocol) CLI tool. MCP tools don't belong in the model's context window — muxed offloads them to a CLI so agents call tools through shell commands and scripts instead of loading schemas into context. Under the hood it runs a background process with lazy start, auto-reconnect, and idle shutdown.

## Monorepo structure

- `packages/muxed` — the CLI + client library (npm: `muxed`)
- `packages/website` — marketing/docs site (Astro + Starlight + Svelte + Tailwind)
- `specs/` — design specs and architecture docs

## packages/muxed architecture

```
CLI (Commander.js)  →  Unix Socket (JSON-RPC 2.0)  →  Daemon Server
                                                         ↓
                                                    ServerPool
                                                         ↓
                                                  ServerManager(s)
                                                         ↓
                                              MCP Transports (stdio / HTTP / SSE)
```

Key source directories:
- `src/cli/` — CLI entry (`index.ts`) and commands (`commands/*.ts`), formatter (`formatter.ts`)
- `src/client/` — TypeScript client library (`index.ts`) and socket IPC (`socket.ts`)
- `src/daemon/` — daemon server (`server.ts`), process management (`process.ts`), HTTP server (`http-server.ts`)
- `src/core/` — server pool (`server-pool.ts`), server manager (`server-manager.ts`), config (`config.ts`), types (`types.ts`), agents (`agents.ts`)
- `src/mcp/` — MCP proxy mode (`mcp-proxy.ts`)
- `src/codegen/` — type generation (`typegen.ts`)
- `src/analytics.ts` — PostHog telemetry

CLI commands: `servers`, `tools`, `info`, `call`, `grep`, `resources`, `read`, `prompts`, `prompt`, `completions`, `tasks`, `task`, `task-result`, `task-cancel`, `init`, `mcp`, `typegen`, `telemetry`, `daemon`

## Key dependencies

- `@modelcontextprotocol/sdk` — MCP protocol types and transports
- `commander` — CLI framework
- `zod` — schema validation
- `json-schema-to-typescript` — codegen for tool types
- `posthog-node` — analytics
- `obuild` — build tool

## Scripts (packages/muxed)

- `pnpm build` — build with obuild
- `pnpm dev` — run CLI from source (`node src/cli.ts`)
- `pnpm test` — vitest
- `pnpm type-check` — tsc --noEmit
- `pnpm format` / `pnpm format:check` — prettier

## Config file

`muxed.config.json` at project root. Defines `mcpServers` (stdio or HTTP configs) and `daemon` settings (idle timeout, log level, HTTP listener, etc.). See `src/core/types.ts` for the `MuxedConfig` type.

## Daemon details

- Socket path: `~/.muxed/muxed.sock`
- PID file: `~/.muxed/muxed.pid`
- Auto-starts on first CLI command, auto-shuts down after 5 min idle (configurable)
- JSON-RPC 2.0 methods: `servers/list`, `tools/list`, `tools/call`, `tools/call-async`, `tools/info`, `tools/grep`, `resources/*`, `prompts/*`, `completions/*`, `tasks/*`, `daemon/*`, `config/reload`, `auth/status`

# Code style

Use kebab case for JS and TS.

<!-- rtk-instructions v2 -->

# RTK (Rust Token Killer) - Token-Optimized Commands

## Golden Rule

**Always prefix commands with `rtk`**. If RTK has a dedicated filter, it uses it. If not, it passes through unchanged. This means RTK is always safe to use.

**Important**: Even in command chains with `&&`, use `rtk`:

```bash
# ❌ Wrong
git add . && git commit -m "msg" && git push

# ✅ Correct
rtk git add . && rtk git commit -m "msg" && rtk git push
```

## RTK Commands by Workflow

### Build & Compile (80-90% savings)

```bash
rtk cargo build         # Cargo build output
rtk cargo check         # Cargo check output
rtk cargo clippy        # Clippy warnings grouped by file (80%)
rtk tsc                 # TypeScript errors grouped by file/code (83%)
rtk lint                # ESLint/Biome violations grouped (84%)
rtk prettier --check    # Files needing format only (70%)
rtk next build          # Next.js build with route metrics (87%)
```

### Test (90-99% savings)

```bash
rtk cargo test          # Cargo test failures only (90%)
rtk vitest run          # Vitest failures only (99.5%)
rtk playwright test     # Playwright failures only (94%)
rtk test <cmd>          # Generic test wrapper - failures only
```

### Git (59-80% savings)

```bash
rtk git status          # Compact status
rtk git log             # Compact log (works with all git flags)
rtk git diff            # Compact diff (80%)
rtk git show            # Compact show (80%)
rtk git add             # Ultra-compact confirmations (59%)
rtk git commit          # Ultra-compact confirmations (59%)
rtk git push            # Ultra-compact confirmations
rtk git pull            # Ultra-compact confirmations
rtk git branch          # Compact branch list
rtk git fetch           # Compact fetch
rtk git stash           # Compact stash
rtk git worktree        # Compact worktree
```

Note: Git passthrough works for ALL subcommands, even those not explicitly listed.

### GitHub (26-87% savings)

```bash
rtk gh pr view <num>    # Compact PR view (87%)
rtk gh pr checks        # Compact PR checks (79%)
rtk gh run list         # Compact workflow runs (82%)
rtk gh issue list       # Compact issue list (80%)
rtk gh api              # Compact API responses (26%)
```

### JavaScript/TypeScript Tooling (70-90% savings)

```bash
rtk pnpm list           # Compact dependency tree (70%)
rtk pnpm outdated       # Compact outdated packages (80%)
rtk pnpm install        # Compact install output (90%)
rtk npm run <script>    # Compact npm script output
rtk npx <cmd>           # Compact npx command output
rtk prisma              # Prisma without ASCII art (88%)
```

### Files & Search (60-75% savings)

```bash
rtk ls <path>           # Tree format, compact (65%)
rtk read <file>         # Code reading with filtering (60%)
rtk grep <pattern>      # Search grouped by file (75%)
rtk find <pattern>      # Find grouped by directory (70%)
```

### Analysis & Debug (70-90% savings)

```bash
rtk err <cmd>           # Filter errors only from any command
rtk log <file>          # Deduplicated logs with counts
rtk json <file>         # JSON structure without values
rtk deps                # Dependency overview
rtk env                 # Environment variables compact
rtk summary <cmd>       # Smart summary of command output
rtk diff                # Ultra-compact diffs
```

### Infrastructure (85% savings)

```bash
rtk docker ps           # Compact container list
rtk docker images       # Compact image list
rtk docker logs <c>     # Deduplicated logs
rtk kubectl get         # Compact resource list
rtk kubectl logs        # Deduplicated pod logs
```

### Network (65-70% savings)

```bash
rtk curl <url>          # Compact HTTP responses (70%)
rtk wget <url>          # Compact download output (65%)
```

### Meta Commands

```bash
rtk gain                # View token savings statistics
rtk gain --history      # View command history with savings
rtk discover            # Analyze Claude Code sessions for missed RTK usage
rtk proxy <cmd>         # Run command without filtering (for debugging)
rtk init                # Add RTK instructions to CLAUDE.md
rtk init --global       # Add RTK to ~/.claude/CLAUDE.md
```

## Token Savings Overview

| Category         | Commands                       | Typical Savings |
| ---------------- | ------------------------------ | --------------- |
| Tests            | vitest, playwright, cargo test | 90-99%          |
| Build            | next, tsc, lint, prettier      | 70-87%          |
| Git              | status, log, diff, add, commit | 59-80%          |
| GitHub           | gh pr, gh run, gh issue        | 26-87%          |
| Package Managers | pnpm, npm, npx                 | 70-90%          |
| Files            | ls, read, grep, find           | 60-75%          |
| Infrastructure   | docker, kubectl                | 85%             |
| Network          | curl, wget                     | 65-70%          |

Overall average: **60-90% token reduction** on common development operations.

<!-- /rtk-instructions -->

# Website development guidelines

Use Tailwind for styling.
Use Svelte for frontend components.
