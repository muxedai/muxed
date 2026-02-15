import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { ServerConfig } from './types.js';
import type { AgentDef, DiscoveredConfig } from './agents.js';
import { mergeServers, writeMcpdConfig, modifyAgentConfig, getMcpdConfigPath } from './agents.js';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mcpd-agents-test-'));
}

function writeJson(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function makeAgent(overrides: Partial<AgentDef> = {}): AgentDef {
  return {
    name: 'test-agent',
    scope: 'local',
    configPath: () => '/tmp/test',
    serversKey: 'mcpServers',
    ...overrides,
  };
}

function makeDiscovered(
  agentOverrides: Partial<AgentDef>,
  overrides: Partial<Omit<DiscoveredConfig, 'agent'>>
): DiscoveredConfig {
  return {
    agent: makeAgent(agentOverrides),
    configPath: '/tmp/test/mcp.json',
    servers: {},
    rawContent: {},
    ...overrides,
  };
}

describe('mergeServers', () => {
  it('imports servers into an empty mcpd config', () => {
    const discovered: DiscoveredConfig[] = [
      makeDiscovered(
        { name: 'cursor' },
        {
          servers: {
            filesystem: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] },
            github: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] },
          },
        }
      ),
    ];

    const result = mergeServers(discovered, {});

    expect(result.imported).toEqual(['filesystem', 'github']);
    expect(result.skipped).toEqual([]);
    expect(result.conflicts).toEqual([]);
    expect(result.merged.filesystem).toEqual({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem'],
    });
    expect(result.merged.github).toEqual({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
    });
  });

  it('skips servers that already exist in mcpd config', () => {
    const existing: Record<string, ServerConfig> = {
      filesystem: { command: 'npx', args: ['old-filesystem'] },
    };

    const discovered: DiscoveredConfig[] = [
      makeDiscovered(
        { name: 'cursor' },
        {
          servers: {
            filesystem: { command: 'npx', args: ['new-filesystem'] },
            github: { command: 'npx', args: ['github'] },
          },
        }
      ),
    ];

    const result = mergeServers(discovered, existing);

    expect(result.imported).toEqual(['github']);
    expect(result.skipped).toEqual(['filesystem']);
    expect(result.merged.filesystem).toEqual({ command: 'npx', args: ['old-filesystem'] });
  });

  it('deduplicates identical servers from multiple agents', () => {
    const serverConfig: ServerConfig = { command: 'npx', args: ['-y', 'mcp-github'] };

    const discovered: DiscoveredConfig[] = [
      makeDiscovered({ name: 'cursor' }, { servers: { github: serverConfig } }),
      makeDiscovered({ name: 'claude-code' }, { servers: { github: serverConfig } }),
    ];

    const result = mergeServers(discovered, {});

    expect(result.imported).toEqual(['github']);
    expect(result.conflicts).toEqual([]);
  });

  it('resolves conflicts by prefixing with agent name', () => {
    const discovered: DiscoveredConfig[] = [
      makeDiscovered(
        { name: 'cursor' },
        {
          servers: { github: { command: 'npx', args: ['cursor-github'] } },
        }
      ),
      makeDiscovered(
        { name: 'vscode' },
        {
          servers: { github: { command: 'npx', args: ['vscode-github'] } },
        }
      ),
    ];

    const result = mergeServers(discovered, {});

    expect(result.imported).toContain('cursor-github');
    expect(result.imported).toContain('vscode-github');
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]!.name).toBe('github');
    expect(result.conflicts[0]!.agents).toEqual(['cursor', 'vscode']);
  });

  it('handles global scope agent labels in conflicts', () => {
    const discovered: DiscoveredConfig[] = [
      makeDiscovered(
        { name: 'cursor', scope: 'local' },
        {
          servers: { myserver: { command: 'a' } },
        }
      ),
      makeDiscovered(
        { name: 'cursor', scope: 'global' },
        {
          servers: { myserver: { command: 'b' } },
        }
      ),
    ];

    const result = mergeServers(discovered, {});

    expect(result.imported).toContain('cursor-myserver');
    expect(result.conflicts).toHaveLength(1);
  });

  it('returns empty results for empty input', () => {
    const result = mergeServers([], {});

    expect(result.imported).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.conflicts).toEqual([]);
    expect(result.merged).toEqual({});
  });
});

describe('writeMcpdConfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates a new config file with servers', () => {
    const configPath = path.join(tmpDir, 'mcpd.config.json');
    const servers: Record<string, ServerConfig> = {
      filesystem: { command: 'npx', args: ['-y', 'fs-server'] },
    };

    writeMcpdConfig(configPath, servers);

    const written = readJson(configPath) as { mcpServers: Record<string, unknown> };
    expect(written.mcpServers.filesystem).toEqual({ command: 'npx', args: ['-y', 'fs-server'] });
  });

  it('preserves existing daemon config when writing servers', () => {
    const configPath = path.join(tmpDir, 'mcpd.config.json');
    writeJson(configPath, {
      mcpServers: {},
      daemon: { idleTimeout: 60000 },
    });

    writeMcpdConfig(configPath, { github: { command: 'npx', args: ['github'] } });

    const written = readJson(configPath) as {
      daemon: { idleTimeout: number };
      mcpServers: Record<string, unknown>;
    };
    expect(written.daemon.idleTimeout).toBe(60000);
    expect(written.mcpServers.github).toBeDefined();
  });

  it('creates parent directories if needed', () => {
    const configPath = path.join(tmpDir, 'nested', 'deep', 'config.json');

    writeMcpdConfig(configPath, { test: { command: 'echo' } });

    expect(fs.existsSync(configPath)).toBe(true);
  });

  it('overwrites corrupted config file', () => {
    const configPath = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(configPath, 'not valid json{{{');

    writeMcpdConfig(configPath, { test: { command: 'echo' } });

    const written = readJson(configPath) as { mcpServers: Record<string, unknown> };
    expect(written.mcpServers.test).toEqual({ command: 'echo' });
  });
});

describe('modifyAgentConfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates a backup before modifying', () => {
    const configPath = path.join(tmpDir, 'mcp.json');
    const original = { mcpServers: { foo: { command: 'foo' } } };
    writeJson(configPath, original);

    const dc = makeDiscovered(
      { name: 'cursor', serversKey: 'mcpServers' },
      { configPath, rawContent: original }
    );

    modifyAgentConfig(dc, { delete: true, replace: true });

    expect(fs.existsSync(configPath + '.bak')).toBe(true);
    const backup = readJson(configPath + '.bak');
    expect(backup).toEqual(original);
  });

  it('removes servers and injects mcpd entry when delete+replace', () => {
    const configPath = path.join(tmpDir, 'mcp.json');
    const original = {
      mcpServers: { foo: { command: 'foo' }, bar: { command: 'bar' } },
      otherConfig: true,
    };
    writeJson(configPath, original);

    const dc = makeDiscovered(
      { name: 'cursor', serversKey: 'mcpServers' },
      { configPath, rawContent: original }
    );

    modifyAgentConfig(dc, { delete: true, replace: true });

    const modified = readJson(configPath) as Record<string, unknown>;
    expect(modified.otherConfig).toBe(true);
    const mcpServers = modified.mcpServers as Record<string, unknown>;
    expect(mcpServers.mcpd).toEqual({ command: 'npx', args: ['mcpd@latest', 'proxy'] });
    expect(mcpServers.foo).toBeUndefined();
    expect(mcpServers.bar).toBeUndefined();
  });

  it('removes servers without injecting mcpd when delete+no-replace', () => {
    const configPath = path.join(tmpDir, 'mcp.json');
    const original = { mcpServers: { foo: { command: 'foo' } }, other: 'kept' };
    writeJson(configPath, original);

    const dc = makeDiscovered(
      { name: 'cursor', serversKey: 'mcpServers' },
      { configPath, rawContent: original }
    );

    modifyAgentConfig(dc, { delete: true, replace: false });

    const modified = readJson(configPath) as Record<string, unknown>;
    expect(modified.mcpServers).toBeUndefined();
    expect(modified.other).toBe('kept');
  });

  it('uses VS Code format for servers-key agents', () => {
    const configPath = path.join(tmpDir, 'mcp.json');
    const original = { servers: { foo: { type: 'stdio', command: 'foo' } } };
    writeJson(configPath, original);

    const dc = makeDiscovered(
      { name: 'vscode', serversKey: 'servers' },
      { configPath, rawContent: original }
    );

    modifyAgentConfig(dc, { delete: true, replace: true });

    const modified = readJson(configPath) as Record<string, unknown>;
    const servers = modified.servers as Record<string, unknown>;
    expect(servers.mcpd).toEqual({ type: 'stdio', command: 'npx', args: ['mcpd@latest', 'proxy'] });
  });

  it('preserves indentation from original file', () => {
    const configPath = path.join(tmpDir, 'mcp.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({ mcpServers: { foo: { command: 'x' } } }, null, 4)
    );

    const dc = makeDiscovered(
      { name: 'cursor', serversKey: 'mcpServers' },
      { configPath, rawContent: { mcpServers: { foo: { command: 'x' } } } }
    );

    modifyAgentConfig(dc, { delete: true, replace: true });

    const text = fs.readFileSync(configPath, 'utf-8');
    expect(text).toContain('    "mcpServers"');
  });
});

describe('getMcpdConfigPath', () => {
  it('returns explicit path when provided', () => {
    expect(getMcpdConfigPath('local', '/my/custom/path.json')).toBe('/my/custom/path.json');
  });

  it('returns cwd-based path for local scope', () => {
    const result = getMcpdConfigPath('local');
    expect(result).toBe(path.join(process.cwd(), 'mcpd.config.json'));
  });

  it('returns home-based path for global scope', () => {
    const result = getMcpdConfigPath('global');
    expect(result).toBe(path.join(os.homedir(), '.config', 'mcpd', 'config.json'));
  });
});
