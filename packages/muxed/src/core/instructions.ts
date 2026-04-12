import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { getVersion } from '../utils/version.js';
import { makeCliFragments, buildPrompt } from './prompt.js';

// --- Types ---

export type InstructionTarget = {
  name: string;
  filePath: string;
  format: 'tagged' | 'owned';
  scope: 'global' | 'local';
};

export type InstructionResult = {
  target: string;
  filePath: string;
  action: 'created' | 'updated' | 'skipped' | 'up-to-date';
  previousVersion?: string;
  newVersion?: string;
};

// --- Version comparison ---

export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na < nb) return -1;
    if (na > nb) return 1;
  }
  return 0;
}

// --- Version extraction ---

const MUXED_BLOCK_RE = /<muxed\s+version="([^"]+)">\n?([\s\S]*?)\n?<\/muxed>/;
const MDC_VERSION_RE = /muxed_version:\s*(.+)/;

export function extractMuxedVersion(content: string, format: 'tagged' | 'owned'): string | null {
  if (format === 'tagged') {
    const match = content.match(MUXED_BLOCK_RE);
    return match?.[1]?.trim() ?? null;
  }
  // MDC format: version in YAML frontmatter
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;
  const versionMatch = fmMatch[1]!.match(MDC_VERSION_RE);
  return versionMatch?.[1]?.trim() ?? null;
}

// --- Targets ---

export function getInstructionTargets(opts: { local: boolean }): InstructionTarget[] {
  const home = os.homedir();
  const cwd = process.cwd();
  const targets: InstructionTarget[] = [];

  // Global targets — always included
  targets.push({
    name: 'CLAUDE.md (global)',
    filePath: path.join(home, '.claude', 'CLAUDE.md'),
    format: 'tagged',
    scope: 'global',
  });
  targets.push({
    name: 'AGENTS.md (global)',
    filePath: path.join(home, '.codex', 'AGENTS.md'),
    format: 'tagged',
    scope: 'global',
  });

  // Cursor local — only when .cursor/ dir exists
  const cursorDir = path.join(cwd, '.cursor');
  if (fs.existsSync(cursorDir)) {
    targets.push({
      name: '.cursor/rules/muxed.mdc',
      filePath: path.join(cursorDir, 'rules', 'muxed.mdc'),
      format: 'owned',
      scope: 'local',
    });
  }

  // Local targets — only with --local flag
  if (opts.local) {
    targets.push({
      name: 'CLAUDE.md (local)',
      filePath: path.join(cwd, 'CLAUDE.md'),
      format: 'tagged',
      scope: 'local',
    });
    targets.push({
      name: 'AGENTS.md (local)',
      filePath: path.join(cwd, 'AGENTS.md'),
      format: 'tagged',
      scope: 'local',
    });
  }

  return targets;
}

// --- Runtime detection ---

let cachedHasBun: boolean | null = null;

export function hasBun(): boolean {
  if (cachedHasBun !== null) return cachedHasBun;
  try {
    execSync('bun --version', { stdio: 'ignore' });
    cachedHasBun = true;
  } catch {
    cachedHasBun = false;
  }
  return cachedHasBun;
}

// --- Static instruction content ---

export function buildStaticInstructions(): string {
  const bun = hasBun();
  const run = bun ? 'bunx' : 'npx';
  const tsx = bun ? 'bun' : 'npx tsx';

  const fragments = makeCliFragments(run);

  const scripts = `## Node.js / TypeScript Scripts (Preferred for Complex Workflows)

For multi-step MCP workflows, **write and execute a script** instead of making individual CLI calls. A single script execution replaces many sequential CLI invocations — dramatically reducing round-trips and token usage.

\`\`\`typescript
import { createClient } from 'muxed/client';

const client = await createClient();

// Batch multiple MCP operations in one script execution
const [tools, result, data] = await Promise.all([
  client.tools(),
  client.call('server/tool', { param: 'value' }),
  client.call('db/query', { sql: 'SELECT ...' }),
]);

// Process results, chain calls, handle errors — all in one execution
console.log(JSON.stringify({ tools: tools.length, result, data }));
\`\`\`

Run scripts with: \`${tsx} script.ts\`.

**When to use scripts vs CLI:**
- **CLI** (\`${run} muxed call ...\`) — single tool discovery or one-off calls
- **Scripts** — any workflow involving 2+ MCP calls, data processing, or conditional logic`;

  return buildPrompt(
    {
      ...fragments,
      intro:
        'Muxed is a CLI tool and Node.js library that proxies multiple MCP servers behind a single daemon. Use it to discover and call MCP tools on demand.',
    },
    {
      heading: '# Muxed — MCP CLI Proxy',
      scripts,
    }
  );
}

// --- Injection ---

function wrapTaggedBlock(content: string, version: string): string {
  return `<muxed version="${version}">\n${content}\n</muxed>`;
}

function buildMdcFile(content: string, version: string): string {
  return `---
description: Muxed MCP CLI proxy - usage instructions
globs:
alwaysApply: true
muxed_version: ${version}
---

${content}
`;
}

export function injectInstructions(
  target: InstructionTarget,
  instructions: string,
  version: string,
  opts: { dryRun: boolean }
): InstructionResult {
  const base: Pick<InstructionResult, 'target' | 'filePath'> = {
    target: target.name,
    filePath: target.filePath,
  };

  // Read existing content if file exists
  let existing: string | null = null;
  if (fs.existsSync(target.filePath)) {
    existing = fs.readFileSync(target.filePath, 'utf-8');
  }

  // For owned files (MDC), we write the entire file
  if (target.format === 'owned') {
    if (existing !== null) {
      const existingVersion = extractMuxedVersion(existing, 'owned');
      if (existingVersion && compareSemver(existingVersion, version) >= 0) {
        return { ...base, action: 'up-to-date', previousVersion: existingVersion };
      }
      if (!opts.dryRun) {
        const dir = path.dirname(target.filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(target.filePath, buildMdcFile(instructions, version));
      }
      return {
        ...base,
        action: existingVersion ? 'updated' : 'created',
        previousVersion: existingVersion ?? undefined,
        newVersion: version,
      };
    }
    // File doesn't exist — create
    if (!opts.dryRun) {
      const dir = path.dirname(target.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(target.filePath, buildMdcFile(instructions, version));
    }
    return { ...base, action: 'created', newVersion: version };
  }

  // Tagged format — inject <muxed> block
  const block = wrapTaggedBlock(instructions, version);

  if (existing === null) {
    // File doesn't exist — create with just the block
    if (!opts.dryRun) {
      const dir = path.dirname(target.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(target.filePath, block + '\n');
    }
    return { ...base, action: 'created', newVersion: version };
  }

  // File exists — check for existing muxed block
  const existingVersion = extractMuxedVersion(existing, 'tagged');

  if (existingVersion !== null) {
    // Block exists — check version
    if (compareSemver(existingVersion, version) >= 0) {
      return { ...base, action: 'up-to-date', previousVersion: existingVersion };
    }
    // Replace the existing block
    if (!opts.dryRun) {
      const updated = existing.replace(MUXED_BLOCK_RE, block);
      fs.writeFileSync(target.filePath, updated);
    }
    return {
      ...base,
      action: 'updated',
      previousVersion: existingVersion,
      newVersion: version,
    };
  }

  // No existing block — append
  if (!opts.dryRun) {
    const separator = existing.endsWith('\n') ? '\n' : '\n\n';
    fs.writeFileSync(target.filePath, existing + separator + block + '\n');
  }
  return { ...base, action: 'created', newVersion: version };
}

export function injectAllInstructions(opts: {
  local: boolean;
  dryRun: boolean;
}): InstructionResult[] {
  const targets = getInstructionTargets({ local: opts.local });
  const instructions = buildStaticInstructions();
  const version = getVersion();

  return targets.map((target) => injectInstructions(target, instructions, version, opts));
}
