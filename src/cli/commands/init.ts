import { Command } from 'commander';
import {
  discoverAgentConfigs,
  mergeServers,
  writeMcpdConfig,
  modifyAgentConfig,
  getMcpdConfigPath,
} from '../../core/agents.js';
import type { InitResult } from '../../core/agents.js';
import type { ServerConfig } from '../../core/types.js';
import { formatInit, formatJson } from '../formatter.js';
import fs from 'node:fs';

export const initCommand = new Command('init')
  .description('Import MCP servers from coding agents into mcpd')
  .option('--dry-run', 'Show what would be done without writing files')
  .option('--json', 'Output as JSON')
  .option('--no-delete', 'Keep original server entries in agent configs')
  .option('--no-replace', "Don't add mcpd entry to agent configs")
  .action(async (opts: { dryRun?: boolean; json?: boolean; delete: boolean; replace: boolean }) => {
    const configPath = initCommand.parent?.opts().config as string | undefined;

    // 1. Discover
    const { discovered, warnings } = discoverAgentConfigs();

    if (discovered.length === 0) {
      const msg = 'No MCP server configurations found in any known agent config files.';
      console.log(opts.json ? formatJson({ message: msg }) : msg);
      return;
    }

    // 2. Split by scope
    const localConfigs = discovered.filter((d) => d.agent.scope === 'local');
    const globalConfigs = discovered.filter((d) => d.agent.scope === 'global');

    const imported: string[] = [];
    const skipped: string[] = [];
    const conflicts: InitResult['conflicts'] = [];
    const modifiedFiles: string[] = [];
    const mcpdPaths: string[] = [];

    // 3. Process local configs
    if (localConfigs.length > 0) {
      const localMcpdPath = getMcpdConfigPath('local', configPath);
      mcpdPaths.push(localMcpdPath);

      let existingServers: Record<string, ServerConfig> = {};
      if (fs.existsSync(localMcpdPath)) {
        try {
          const existing = JSON.parse(fs.readFileSync(localMcpdPath, 'utf-8')) as Record<
            string,
            unknown
          >;
          existingServers = (existing.mcpServers ?? {}) as Record<string, ServerConfig>;
        } catch {
          // Start fresh
        }
      }

      const result = mergeServers(localConfigs, existingServers);
      imported.push(...result.imported);
      skipped.push(...result.skipped);
      conflicts.push(...result.conflicts);

      if (!opts.dryRun && result.imported.length > 0) {
        writeMcpdConfig(localMcpdPath, result.merged);
      }
    }

    // 4. Process global configs
    if (globalConfigs.length > 0) {
      const globalMcpdPath = getMcpdConfigPath('global', configPath);
      if (!mcpdPaths.includes(globalMcpdPath)) mcpdPaths.push(globalMcpdPath);

      let existingServers: Record<string, ServerConfig> = {};
      if (fs.existsSync(globalMcpdPath)) {
        try {
          const existing = JSON.parse(fs.readFileSync(globalMcpdPath, 'utf-8')) as Record<
            string,
            unknown
          >;
          existingServers = (existing.mcpServers ?? {}) as Record<string, ServerConfig>;
        } catch {
          // Start fresh
        }
      }

      const result = mergeServers(globalConfigs, existingServers);
      imported.push(...result.imported);
      skipped.push(...result.skipped);
      conflicts.push(...result.conflicts);

      if (!opts.dryRun && result.imported.length > 0) {
        writeMcpdConfig(globalMcpdPath, result.merged);
      }
    }

    // 5. Modify agent configs (backup + remove servers + optionally add mcpd entry)
    if (!opts.dryRun && opts.delete) {
      for (const dc of discovered) {
        try {
          modifyAgentConfig(dc, { delete: opts.delete, replace: opts.replace });
          modifiedFiles.push(dc.configPath);
        } catch (err) {
          warnings.push(
            `Failed to modify ${dc.configPath}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }

    // 6. Build result
    const initResult: InitResult = {
      discovered: discovered.map((d) => ({
        agent: d.agent.name,
        scope: d.agent.scope,
        path: d.configPath,
        serverCount: Object.keys(d.servers).length,
      })),
      imported,
      skipped,
      conflicts,
      warnings,
      modifiedFiles,
      mcpdConfigPath: mcpdPaths.join(', '),
      dryRun: opts.dryRun ?? false,
    };

    console.log(opts.json ? formatJson(initResult) : formatInit(initResult));
  });
