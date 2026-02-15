import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadConfig } from './config.js';

function writeTmpConfig(dir: string, config: unknown): string {
  const filePath = path.join(dir, 'mcpd.config.json');
  fs.writeFileSync(filePath, JSON.stringify(config));
  return filePath;
}

describe('loadConfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpd-test-'));
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

  it('throws on missing config file', () => {
    expect(() => loadConfig('/nonexistent/path/config.json')).toThrow('Config file not found');
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
    expect(Object.keys(config.mcpServers)).toEqual(['filesystem', 'remote']);
  });
});
