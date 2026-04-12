import { Command } from 'commander';
import {
  discoverAgentConfigs,
  mergeServers,
  writeMuxedConfig,
  modifyAgentConfig,
  getMuxedConfigPath,
} from '../../core/agents.js';
import type { Conflict, InitResult, UnresolvedConflict } from '../../core/agents.js';
import type { ServerConfig } from '../../core/types.js';
import { injectAllInstructions } from '../../core/instructions.js';
import { formatInit, formatJson } from '../formatter.js';
import { confirm, choose } from '../prompt.js';
import { capture } from '../../analytics.js';
import fs from 'node:fs';

const AGENT_PRIORITY = ['claude-code', 'cursor'];

function pickByPriority(options: Array<{ agent: string; config: ServerConfig }>): {
  agent: string;
  config: ServerConfig;
} {
  for (const preferred of AGENT_PRIORITY) {
    const match = options.find((o) => o.agent.replace(/\s*\(global\)/, '') === preferred);
    if (match) return match;
  }
  return options[0]!;
}

function formatServerSummary(config: ServerConfig): string {
  if ('command' in config) {
    const args = config.args ? ` ${config.args.join(' ')}` : '';
    return `${config.command}${args}`;
  }
  return config.url;
}

async function resolveConflicts(
  unresolvedConflicts: UnresolvedConflict[],
  isInteractive: boolean
): Promise<{ resolved: Record<string, ServerConfig>; conflicts: Conflict[] }> {
  const resolved: Record<string, ServerConfig> = {};
  const conflicts: Conflict[] = [];

  for (const conflict of unresolvedConflicts) {
    let chosen: { agent: string; config: ServerConfig };

    if (isInteractive) {
      chosen = await choose(
        `\nConflict: "${conflict.name}" has different configs:`,
        conflict.options.map((o) => ({
          label: `${o.agent}: ${formatServerSummary(o.config)}`,
          value: o,
        }))
      );
    } else {
      chosen = pickByPriority(conflict.options);
    }

    resolved[conflict.name] = chosen.config;
    conflicts.push({
      name: conflict.name,
      agents: conflict.options.map((o) => o.agent),
      chosenAgent: chosen.agent,
    });
  }

  return { resolved, conflicts };
}

export const initCommand = new Command('init')
  .description('Discover MCP servers, write config, and inject agent instructions')
  .option('--dry-run', 'Preview changes without writing any files')
  .option('--json', 'Output as JSON (machine-readable)')
  .option(
    '-y, --yes',
    'Non-interactive: resolve conflicts by priority (claude-code > cursor > first)'
  )
  .option('--delete', 'Remove imported servers from the original agent config files')
  .option('--no-replace', "Don't add a muxed entry to agent configs")
  .option('--local', 'Also inject instructions into project-level CLAUDE.md and AGENTS.md')
  .option('--no-instructions', 'Skip injecting CLI instructions into agent files')
  .addHelpText(
    'after',
    `
What it does:
  1. Scans Claude Desktop, Cursor, VS Code, Windsurf, Cline, Roo Code, Amazon Q
  2. Merges and deduplicates servers into muxed.config.json
  3. Injects CLI usage instructions into ~/.claude/CLAUDE.md, ~/.codex/AGENTS.md,
     and .cursor/rules/muxed.mdc (if .cursor/ exists)

Examples:
  muxed init                 Interactive setup
  muxed init -y              Non-interactive (CI-friendly)
  muxed init --dry-run       Preview without writing files
  muxed init --local         Also inject into project-level agent files`
  )
  .action(
    async (opts: {
      dryRun?: boolean;
      json?: boolean;
      yes?: boolean;
      delete?: boolean;
      replace: boolean;
      local?: boolean;
      instructions: boolean;
    }) => {
      const configPath = initCommand.parent?.opts().config as string | undefined;
      const isInteractive = !opts.dryRun && !opts.json && !opts.yes && !!process.stdin.isTTY;

      // 1. Discover
      const { discovered, warnings } = discoverAgentConfigs();

      if (discovered.length === 0) {
        const msg = 'No MCP server configurations found in any known agent config files.';
        console.log(opts.json ? formatJson({ message: msg }) : msg);
        return;
      }

      // 2. Determine muxed config path – single merged config
      const hasLocalConfigs = discovered.some((d) => d.agent.scope === 'local');
      const muxedPath = getMuxedConfigPath(hasLocalConfigs ? 'local' : 'global', configPath);

      // 3. Read existing muxed servers
      let existingServers: Record<string, ServerConfig> = {};
      if (fs.existsSync(muxedPath)) {
        try {
          const existing = JSON.parse(fs.readFileSync(muxedPath, 'utf-8')) as Record<
            string,
            unknown
          >;
          existingServers = (existing.mcpServers ?? {}) as Record<string, ServerConfig>;
        } catch {
          // Start fresh
        }
      }

      // 4. Merge all discovered configs (local + global) into one
      const result = mergeServers(discovered, existingServers);

      // 5. Resolve conflicts
      const { resolved, conflicts } = await resolveConflicts(
        result.unresolvedConflicts,
        isInteractive
      );

      // Add resolved conflicts into merged and imported
      const imported = [...result.imported];
      for (const [name, config] of Object.entries(resolved)) {
        result.merged[name] = config;
        imported.push(name);
      }

      // 6. Write muxed config
      if (!opts.dryRun && imported.length > 0) {
        writeMuxedConfig(muxedPath, result.merged);
      }

      // 7. Modify agent configs (backup + remove servers + optionally add muxed entry)
      const modifiedFiles: string[] = [];
      const shouldDelete = isInteractive
        ? await confirm(
            'Remove imported servers from agent config files? (backups will be created)'
          )
        : !!opts.delete;

      if (!opts.dryRun && shouldDelete) {
        for (const dc of discovered) {
          try {
            modifyAgentConfig(dc, { delete: true, replace: opts.replace });
            modifiedFiles.push(dc.configPath);
          } catch (err) {
            warnings.push(
              `Failed to modify ${dc.configPath}: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }
      }

      // 8. Inject instructions into agent instruction files
      const shouldInject = isInteractive
        ? await confirm('Inject muxed CLI instructions into agent files? (CLAUDE.md, AGENTS.md)')
        : opts.instructions;

      const instructionResults = shouldInject
        ? injectAllInstructions({ local: !!opts.local, dryRun: !!opts.dryRun })
        : [];

      // 9. Build result
      const initResult: InitResult = {
        discovered: discovered.map((d) => ({
          agent: d.agent.name,
          scope: d.agent.scope,
          path: d.configPath,
          serverCount: Object.keys(d.servers).length,
        })),
        imported,
        skipped: result.skipped,
        conflicts,
        warnings,
        modifiedFiles,
        muxedConfigPath: muxedPath,
        dryRun: opts.dryRun ?? false,
        instructionResults,
      };

      capture('init_run', {
        dry_run: opts.dryRun ?? false,
        imported_count: imported.length,
        conflict_count: conflicts.length,
        warning_count: warnings.length,
        discovered_agents: initResult.discovered.map((d) => d.agent),
        instruction_targets: instructionResults.length,
        instruction_actions: instructionResults.map((r) => r.action),
      });
      console.log(opts.json ? formatJson(initResult) : formatInit(initResult));
    }
  );
