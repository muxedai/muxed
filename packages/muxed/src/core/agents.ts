import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { ServerConfig } from './types.js';

const home = os.homedir();
const platform = os.platform();

function macPath(...segments: string[]): string | null {
  return platform === 'darwin'
    ? path.join(home, 'Library', 'Application Support', ...segments)
    : null;
}

function linuxPath(...segments: string[]): string | null {
  return platform === 'linux' ? path.join(home, '.config', ...segments) : null;
}

function xdgOrMacPath(linuxSegments: string[], macSegments: string[]): string | null {
  return linuxPath(...linuxSegments) ?? macPath(...macSegments);
}

// Agent definition: describes where an agent stores its MCP server configs
export type AgentDef = {
  name: string;
  scope: 'local' | 'global';
  configPath: () => string | null;
  serversKey: 'mcpServers' | 'servers';
};

// Discovered config from an agent
export type DiscoveredConfig = {
  agent: AgentDef;
  configPath: string;
  servers: Record<string, ServerConfig>;
  rawContent: Record<string, unknown>;
};

// Unresolved conflict: same server name, different configs across agents
export type UnresolvedConflict = {
  name: string;
  options: Array<{ agent: string; config: ServerConfig }>;
};

// Resolved conflict: records which agent's config was kept
export type Conflict = {
  name: string;
  agents: string[];
  chosenAgent: string;
};

// Result of the full init operation
export type InitResult = {
  discovered: Array<{ agent: string; scope: string; path: string; serverCount: number }>;
  imported: string[];
  skipped: string[];
  conflicts: Conflict[];
  warnings: string[];
  modifiedFiles: string[];
  muxedConfigPath: string;
  dryRun: boolean;
};

// All known agent config locations
export function getAgentDefs(): AgentDef[] {
  const cwd = process.cwd();

  return [
    // --- Local (repo-level) ---
    {
      name: 'claude-code',
      scope: 'local' as const,
      configPath: () => path.join(cwd, '.mcp.json'),
      serversKey: 'mcpServers' as const,
    },
    {
      name: 'cursor',
      scope: 'local' as const,
      configPath: () => path.join(cwd, '.cursor', 'mcp.json'),
      serversKey: 'mcpServers' as const,
    },
    {
      name: 'vscode',
      scope: 'local' as const,
      configPath: () => path.join(cwd, '.vscode', 'mcp.json'),
      serversKey: 'servers' as const,
    },
    {
      name: 'roo-code',
      scope: 'local' as const,
      configPath: () => path.join(cwd, '.roo', 'mcp.json'),
      serversKey: 'mcpServers' as const,
    },
    {
      name: 'amazon-q',
      scope: 'local' as const,
      configPath: () => path.join(cwd, '.amazonq', 'mcp.json'),
      serversKey: 'mcpServers' as const,
    },

    // --- Global (user-level) ---
    {
      name: 'claude-desktop',
      scope: 'global' as const,
      configPath: () =>
        xdgOrMacPath(
          ['Claude', 'claude_desktop_config.json'],
          ['Claude', 'claude_desktop_config.json']
        ),
      serversKey: 'mcpServers' as const,
    },
    {
      name: 'cursor',
      scope: 'global' as const,
      configPath: () => path.join(home, '.cursor', 'mcp.json'),
      serversKey: 'mcpServers' as const,
    },
    {
      name: 'windsurf',
      scope: 'global' as const,
      configPath: () => path.join(home, '.codeium', 'windsurf', 'mcp_config.json'),
      serversKey: 'mcpServers' as const,
    },
    {
      name: 'vscode',
      scope: 'global' as const,
      configPath: () => xdgOrMacPath(['Code', 'User', 'mcp.json'], ['Code', 'User', 'mcp.json']),
      serversKey: 'servers' as const,
    },
    {
      name: 'cline',
      scope: 'global' as const,
      configPath: () =>
        xdgOrMacPath(
          [
            'Code',
            'User',
            'globalStorage',
            'saoudrizwan.claude-dev',
            'settings',
            'cline_mcp_settings.json',
          ],
          [
            'Code',
            'User',
            'globalStorage',
            'saoudrizwan.claude-dev',
            'settings',
            'cline_mcp_settings.json',
          ]
        ),
      serversKey: 'mcpServers' as const,
    },
    {
      name: 'roo-code',
      scope: 'global' as const,
      configPath: () =>
        xdgOrMacPath(
          [
            'Code',
            'User',
            'globalStorage',
            'rooveterinaryinc.roo-cline',
            'settings',
            'cline_mcp_settings.json',
          ],
          [
            'Code',
            'User',
            'globalStorage',
            'rooveterinaryinc.roo-cline',
            'settings',
            'cline_mcp_settings.json',
          ]
        ),
      serversKey: 'mcpServers' as const,
    },
    {
      name: 'amazon-q',
      scope: 'global' as const,
      configPath: () => path.join(home, '.aws', 'amazonq', 'mcp.json'),
      serversKey: 'mcpServers' as const,
    },
  ];
}

// Normalize a single server entry from an agent config into muxed's ServerConfig format
function normalizeServer(
  agent: AgentDef,
  name: string,
  raw: Record<string, unknown>,
  warnings: string[]
): ServerConfig | null {
  // Check for VS Code ${input:...} references in env
  const env = raw.env as Record<string, string> | undefined;
  if (env) {
    for (const [key, value] of Object.entries(env)) {
      if (typeof value === 'string' && value.includes('${input:')) {
        warnings.push(
          `${agent.name} server "${name}": env.${key} references ${value} \u2014 set manually in muxed config`
        );
      }
    }
  }

  // Windsurf uses "serverUrl" for HTTP servers
  const url = (raw.url ?? raw.serverUrl) as string | undefined;
  const command = raw.command as string | undefined;

  if (command) {
    const config: ServerConfig = { command };
    if (raw.args && Array.isArray(raw.args)) config.args = raw.args as string[];
    if (env && Object.keys(env).length > 0) config.env = env;
    if (raw.cwd && typeof raw.cwd === 'string') (config as Record<string, unknown>).cwd = raw.cwd;
    return config;
  }

  if (url) {
    const config: ServerConfig = { url };
    // VS Code uses type: "sse", Windsurf may too
    const rawType = raw.type as string | undefined;
    const rawTransport = raw.transport as string | undefined;
    const transport = rawTransport ?? (rawType === 'sse' ? 'sse' : undefined);
    if (transport === 'sse') (config as Record<string, unknown>).transport = 'sse';
    const headers = raw.headers as Record<string, string> | undefined;
    if (headers && Object.keys(headers).length > 0)
      (config as Record<string, unknown>).headers = headers;
    return config;
  }

  return null;
}

// Check if two server configs are functionally identical
function configsEqual(a: ServerConfig, b: ServerConfig): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Discover all agent configs that exist and have MCP servers
export function discoverAgentConfigs(): { discovered: DiscoveredConfig[]; warnings: string[] } {
  const agents = getAgentDefs();
  const discovered: DiscoveredConfig[] = [];
  const warnings: string[] = [];

  for (const agent of agents) {
    const configPath = agent.configPath();
    if (!configPath) continue;

    if (!fs.existsSync(configPath)) continue;

    let rawContent: Record<string, unknown>;
    try {
      const text = fs.readFileSync(configPath, 'utf-8');
      rawContent = JSON.parse(text) as Record<string, unknown>;
    } catch {
      warnings.push(`Skipping ${configPath}: invalid JSON`);
      continue;
    }

    const rawServers = rawContent[agent.serversKey] as
      | Record<string, Record<string, unknown>>
      | undefined;
    if (!rawServers || typeof rawServers !== 'object' || Object.keys(rawServers).length === 0) {
      continue;
    }

    const servers: Record<string, ServerConfig> = {};
    for (const [name, raw] of Object.entries(rawServers)) {
      if (typeof raw !== 'object' || raw === null) continue;
      // Skip if the agent already has an muxed entry (don't import muxed into muxed)
      if (name === 'muxed') continue;
      const normalized = normalizeServer(agent, name, raw as Record<string, unknown>, warnings);
      if (normalized) {
        servers[name] = normalized;
      }
    }

    if (Object.keys(servers).length === 0) continue;

    discovered.push({ agent, configPath, servers, rawContent });
  }

  return { discovered, warnings };
}

// Merge servers from all discovered configs, handling name collisions
export function mergeServers(
  discovered: DiscoveredConfig[],
  existingServers: Record<string, ServerConfig>
): {
  merged: Record<string, ServerConfig>;
  imported: string[];
  skipped: string[];
  unresolvedConflicts: UnresolvedConflict[];
} {
  const merged: Record<string, ServerConfig> = { ...existingServers };
  const imported: string[] = [];
  const skipped: string[] = [];
  const unresolvedConflicts: UnresolvedConflict[] = [];

  // Group all servers by name across agents
  const byName = new Map<string, Array<{ agent: string; config: ServerConfig }>>();
  for (const dc of discovered) {
    for (const [name, config] of Object.entries(dc.servers)) {
      const label = dc.agent.scope === 'global' ? `${dc.agent.name} (global)` : dc.agent.name;
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name)!.push({ agent: label, config });
    }
  }

  for (const [name, entries] of byName) {
    // Already in muxed config – skip
    if (name in existingServers) {
      if (!skipped.includes(name)) skipped.push(name);
      continue;
    }

    // Deduplicate: if all entries have the same config, keep one
    const unique = entries.filter(
      (entry, i, arr) => arr.findIndex((e) => configsEqual(e.config, entry.config)) === i
    );

    if (unique.length === 1) {
      merged[name] = unique[0]!.config;
      imported.push(name);
    } else {
      // Conflict: same name, different configs – leave unresolved
      unresolvedConflicts.push({ name, options: unique });
    }
  }

  return { merged, imported, skipped, unresolvedConflicts };
}

// Detect indentation used in a JSON file
function detectIndent(text: string): string {
  const match = text.match(/^(\s+)"/m);
  return match?.[1] ?? '  ';
}

// Write muxed config file, merging with existing content
export function writeMuxedConfig(configPath: string, servers: Record<string, ServerConfig>): void {
  let existing: Record<string, unknown> = {};
  if (fs.existsSync(configPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
    } catch {
      // Overwrite corrupted file
    }
  }

  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  existing.mcpServers = servers;
  fs.writeFileSync(configPath, JSON.stringify(existing, null, 2) + '\n');
}

// Get the muxed replacement entry for an agent (to be injected after removing original servers)
function getMuxedEntry(agent: AgentDef): Record<string, unknown> {
  if (agent.serversKey === 'servers') {
    // VS Code format
    return { type: 'stdio', command: 'npx', args: ['muxed@latest', 'proxy'] };
  }
  return { command: 'npx', args: ['muxed@latest', 'proxy'] };
}

// Backup and modify an agent config file:
// - Remove original servers
// - Optionally inject muxed entry
export function modifyAgentConfig(
  dc: DiscoveredConfig,
  opts: { delete: boolean; replace: boolean }
): void {
  const text = fs.readFileSync(dc.configPath, 'utf-8');

  // Create backup
  fs.writeFileSync(dc.configPath + '.bak', text);

  const indent = detectIndent(text);
  const content = { ...dc.rawContent };

  if (opts.delete) {
    if (opts.replace) {
      content[dc.agent.serversKey] = { muxed: getMuxedEntry(dc.agent) };
    } else {
      delete content[dc.agent.serversKey];
    }
  }

  fs.writeFileSync(dc.configPath, JSON.stringify(content, null, indent) + '\n');
}

// Determine the muxed config path for a given scope
export function getMuxedConfigPath(scope: 'local' | 'global', explicitPath?: string): string {
  if (explicitPath) return explicitPath;
  if (scope === 'local') return path.join(process.cwd(), 'muxed.config.json');
  return path.join(home, '.config', 'muxed', 'config.json');
}
