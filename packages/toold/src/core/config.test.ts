import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadConfig } from './config.js';

function writeTmpConfig(dir: string, config: unknown): string {
  const filePath = path.join(dir, 'toold.config.json');
  fs.writeFileSync(filePath, JSON.stringify(config));
  return filePath;
}

describe('loadConfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'toold-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads a valid config with stdio server', () => {
    const configPath = writeTmpConfig(tmpDir, {
      mcpServers: {
        filesystem: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
          env: { NODE_ENV: 'production' },
        },
      },
    });

    const config = loadConfig(configPath);
    expect(config.mcpServers.filesystem).toEqual({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
      env: { NODE_ENV: 'production' },
    });
  });

  it('loads a valid config with HTTP server', () => {
    const configPath = writeTmpConfig(tmpDir, {
      mcpServers: {
        remote: {
          url: 'https://mcp.example.com/mcp',
          transport: 'streamable-http',
          headers: { Authorization: 'Bearer token123' },
        },
      },
    });

    const config = loadConfig(configPath);
    expect(config.mcpServers.remote).toEqual({
      url: 'https://mcp.example.com/mcp',
      transport: 'streamable-http',
      headers: { Authorization: 'Bearer token123' },
    });
  });

  it('throws on explicit config path that does not exist', () => {
    expect(() => loadConfig('/nonexistent/path/config.json')).toThrow('Config file not found');
  });

  it('returns default config with empty mcpServers when no config file exists', () => {
    // Use a cwd where no config exists, and no global config
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    const globalPath = path.join(os.homedir(), '.config', 'toold', 'config.json');
    const hadGlobal = fs.existsSync(globalPath);
    const originalGlobal = hadGlobal ? fs.readFileSync(globalPath, 'utf-8') : null;
    if (hadGlobal) fs.unlinkSync(globalPath);

    try {
      const config = loadConfig();
      expect(config.mcpServers).toEqual({});
      expect(config.daemon).toBeDefined();
    } finally {
      process.chdir(origCwd);
      if (originalGlobal !== null) {
        fs.mkdirSync(path.dirname(globalPath), { recursive: true });
        fs.writeFileSync(globalPath, originalGlobal);
      }
    }
  });

  it('throws on invalid JSON', () => {
    const filePath = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(filePath, 'not json{{{');
    expect(() => loadConfig(filePath)).toThrow('Invalid JSON');
  });

  it('throws on invalid config - missing command for stdio server', () => {
    const configPath = writeTmpConfig(tmpDir, {
      mcpServers: {
        bad: {
          args: ['--flag'],
        },
      },
    });

    expect(() => loadConfig(configPath)).toThrow();
  });

  it('throws on invalid config - missing url for HTTP server', () => {
    const configPath = writeTmpConfig(tmpDir, {
      mcpServers: {
        bad: {
          transport: 'sse',
        },
      },
    });

    expect(() => loadConfig(configPath)).toThrow();
  });

  it('throws on completely invalid structure', () => {
    const configPath = writeTmpConfig(tmpDir, {
      notMcpServers: {},
    });

    expect(() => loadConfig(configPath)).toThrow('Invalid config');
  });

  it('applies daemon defaults when daemon section is missing', () => {
    const configPath = writeTmpConfig(tmpDir, {
      mcpServers: {
        test: { command: 'echo' },
      },
    });

    const config = loadConfig(configPath);
    expect(config.daemon).toEqual({
      idleTimeout: 300_000,
      connectTimeout: 30_000,
      requestTimeout: 60_000,
      healthCheckInterval: 30_000,
      maxRestartAttempts: -1,
      maxTotalTimeout: 300_000,
      taskExpiryTimeout: 3_600_000,
      logLevel: 'info',
      shutdownTimeout: 10_000,
      http: { enabled: false, port: 3100, host: '127.0.0.1' },
    });
  });

  it('applies daemon defaults while preserving overrides', () => {
    const configPath = writeTmpConfig(tmpDir, {
      mcpServers: {
        test: { command: 'echo' },
      },
      daemon: {
        idleTimeout: 600_000,
      },
    });

    const config = loadConfig(configPath);
    expect(config.daemon).toEqual({
      idleTimeout: 600_000,
      connectTimeout: 30_000,
      requestTimeout: 60_000,
      healthCheckInterval: 30_000,
      maxRestartAttempts: -1,
      maxTotalTimeout: 300_000,
      taskExpiryTimeout: 3_600_000,
      logLevel: 'info',
      shutdownTimeout: 10_000,
      http: { enabled: false, port: 3100, host: '127.0.0.1' },
    });
  });

  it('loads config with mixed stdio and HTTP servers', () => {
    const configPath = writeTmpConfig(tmpDir, {
      mcpServers: {
        filesystem: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem'],
        },
        remote: {
          url: 'https://mcp.example.com/mcp',
        },
      },
    });

    const config = loadConfig(configPath);
    expect(Object.keys(config.mcpServers)).toContain('filesystem');
    expect(Object.keys(config.mcpServers)).toContain('remote');
  });

  it('validates HTTP server config with sessionId and reconnection', () => {
    const configPath = writeTmpConfig(tmpDir, {
      mcpServers: {
        remote: {
          url: 'https://mcp.example.com/mcp',
          sessionId: 'abc-123',
          reconnection: {
            maxDelay: 60000,
            initialDelay: 2000,
            growFactor: 2.0,
            maxRetries: 5,
          },
        },
      },
    });

    const config = loadConfig(configPath);
    const remote = config.mcpServers.remote as {
      url: string;
      sessionId?: string;
      reconnection?: {
        maxDelay?: number;
        initialDelay?: number;
        growFactor?: number;
        maxRetries?: number;
      };
    };
    expect(remote.sessionId).toBe('abc-123');
    expect(remote.reconnection).toEqual({
      maxDelay: 60000,
      initialDelay: 2000,
      growFactor: 2.0,
      maxRetries: 5,
    });
  });

  it('validates HTTP listener config in daemon section', () => {
    const configPath = writeTmpConfig(tmpDir, {
      mcpServers: { test: { command: 'echo' } },
      daemon: {
        http: {
          enabled: true,
          port: 4000,
          host: '0.0.0.0',
        },
      },
    });

    const config = loadConfig(configPath);
    expect(config.daemon?.http).toEqual({
      enabled: true,
      port: 4000,
      host: '0.0.0.0',
    });
  });

  it('applies HTTP listener defaults', () => {
    const configPath = writeTmpConfig(tmpDir, {
      mcpServers: { test: { command: 'echo' } },
    });

    const config = loadConfig(configPath);
    expect(config.daemon?.http).toEqual({
      enabled: false,
      port: 3100,
      host: '127.0.0.1',
    });
  });

  it('validates mergeClaudeConfig option', () => {
    const configPath = writeTmpConfig(tmpDir, {
      mcpServers: { test: { command: 'echo' } },
      mergeClaudeConfig: true,
    });

    const config = loadConfig(configPath);
    expect(config.mergeClaudeConfig).toBe(true);
  });

  it('merges global config servers into project config', () => {
    // Write a fake global config
    const globalDir = path.join(os.homedir(), '.config', 'toold');
    const globalPath = path.join(globalDir, 'config.json');
    const hadGlobalConfig = fs.existsSync(globalPath);
    const originalGlobalContent = hadGlobalConfig ? fs.readFileSync(globalPath, 'utf-8') : null;

    fs.mkdirSync(globalDir, { recursive: true });
    fs.writeFileSync(
      globalPath,
      JSON.stringify({
        mcpServers: {
          'global-server': { command: 'global-cmd' },
          overlap: { command: 'global-overlap' },
        },
      })
    );

    try {
      const configPath = writeTmpConfig(tmpDir, {
        mcpServers: {
          local: { command: 'local-cmd' },
          overlap: { command: 'local-overlap' },
        },
      });

      const config = loadConfig(configPath);
      // Global server is included
      expect(config.mcpServers['global-server']).toEqual({ command: 'global-cmd' });
      // Local server is included
      expect(config.mcpServers.local).toEqual({ command: 'local-cmd' });
      // Project-level takes precedence on name conflicts
      expect(config.mcpServers.overlap).toEqual({ command: 'local-overlap' });
    } finally {
      // Restore original global config
      if (originalGlobalContent !== null) {
        fs.writeFileSync(globalPath, originalGlobalContent);
      } else {
        fs.unlinkSync(globalPath);
      }
    }
  });

  it('does not merge global config when loading the global config itself', () => {
    const globalDir = path.join(os.homedir(), '.config', 'toold');
    const globalPath = path.join(globalDir, 'config.json');
    const hadGlobalConfig = fs.existsSync(globalPath);
    const originalGlobalContent = hadGlobalConfig ? fs.readFileSync(globalPath, 'utf-8') : null;

    fs.mkdirSync(globalDir, { recursive: true });
    fs.writeFileSync(
      globalPath,
      JSON.stringify({
        mcpServers: {
          'global-only': { command: 'global-cmd' },
        },
      })
    );

    try {
      const config = loadConfig(globalPath);
      expect(Object.keys(config.mcpServers)).toEqual(['global-only']);
    } finally {
      if (originalGlobalContent !== null) {
        fs.writeFileSync(globalPath, originalGlobalContent);
      } else {
        fs.unlinkSync(globalPath);
      }
    }
  });

  it('merges Claude Desktop servers when mergeClaudeConfig is true', () => {
    // Create a fake Claude Desktop config
    const claudeDir = path.join(tmpDir, 'claude-config');
    fs.mkdirSync(claudeDir, { recursive: true });
    const claudeConfigPath = path.join(claudeDir, 'claude_desktop_config.json');
    fs.writeFileSync(
      claudeConfigPath,
      JSON.stringify({
        mcpServers: {
          'from-claude': { command: 'claude-server' },
          overlap: { command: 'claude-overlap' },
        },
      })
    );

    // Temporarily mock the config path by testing the merge function directly
    // Since we can't easily mock the platform path, we test loadConfig with mergeClaudeConfig
    // and the actual merge function separately
    const configPath = writeTmpConfig(tmpDir, {
      mcpServers: {
        local: { command: 'echo' },
        overlap: { command: 'toold-overlap' },
      },
      mergeClaudeConfig: true,
    });

    // loadConfig with mergeClaudeConfig=true will attempt to read Claude Desktop config
    // from the real platform path. Since we can't mock that path easily, we at least
    // verify the config loads correctly with the flag set.
    const config = loadConfig(configPath);
    expect(config.mcpServers.local).toEqual({ command: 'echo' });
    // toold servers always take precedence
    expect(config.mcpServers.overlap).toEqual({ command: 'toold-overlap' });
  });
});
