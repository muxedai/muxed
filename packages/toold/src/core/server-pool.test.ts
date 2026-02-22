import { describe, it, expect, afterEach } from 'vitest';
import { ServerPool } from './server-pool.js';
import type { TooldConfig } from './types.js';

const validConfig: TooldConfig = {
  mcpServers: {
    everything: {
      command: 'node',
      args: ['node_modules/@modelcontextprotocol/server-everything/dist/index.js', 'stdio'],
    },
  },
  daemon: {
    connectTimeout: 30_000,
  },
};

describe('ServerPool', () => {
  let pool: ServerPool;

  afterEach(async () => {
    if (pool) {
      await pool.disconnectAll().catch(() => {});
    }
  });

  it('connectAll connects a valid server', async () => {
    pool = new ServerPool();
    await pool.connectAll(validConfig);

    const servers = pool.listServers();
    expect(servers).toHaveLength(1);
    expect(servers[0]!.name).toBe('everything');
    expect(servers[0]!.status).toBe('connected');
  });

  it('listAllTools aggregates tools with server names', async () => {
    pool = new ServerPool();
    await pool.connectAll(validConfig);

    const tools = pool.listAllTools();
    expect(tools.length).toBeGreaterThan(0);
    expect(tools[0]!.server).toBe('everything');
    expect(tools[0]!.tool.name).toBeTruthy();
  });

  it('findTool locates a tool by server/tool format', async () => {
    pool = new ServerPool();
    await pool.connectAll(validConfig);

    const result = pool.findTool('everything/echo');
    expect(result).toBeDefined();
    expect(result!.tool.name).toBe('echo');
    expect(result!.manager.name).toBe('everything');
  });

  it('findTool returns undefined for unknown tool', async () => {
    pool = new ServerPool();
    await pool.connectAll(validConfig);

    expect(pool.findTool('everything/nonexistent')).toBeUndefined();
    expect(pool.findTool('unknown/echo')).toBeUndefined();
    expect(pool.findTool('invalidformat')).toBeUndefined();
  });

  it('getServer returns the manager for a known server', async () => {
    pool = new ServerPool();
    await pool.connectAll(validConfig);

    const manager = pool.getServer('everything');
    expect(manager).toBeDefined();
    expect(manager!.name).toBe('everything');
  });

  it('getServer returns undefined for unknown server', async () => {
    pool = new ServerPool();
    await pool.connectAll(validConfig);

    expect(pool.getServer('unknown')).toBeUndefined();
  });

  it('grepTools matches tool name', async () => {
    pool = new ServerPool();
    await pool.connectAll(validConfig);

    const results = pool.grepTools('echo');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => /echo/i.test(r.tool.name))).toBe(true);
  });

  it('grepTools matches server name', async () => {
    pool = new ServerPool();
    await pool.connectAll(validConfig);

    const results = pool.grepTools('everything');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.server === 'everything')).toBe(true);
  });

  it('grepTools matches combined server/tool pattern', async () => {
    pool = new ServerPool();
    await pool.connectAll(validConfig);

    const results = pool.grepTools('everything.*echo');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.server).toBe('everything');
    expect(results[0]!.tool.name).toBe('echo');
  });

  it('grepTools returns empty for no match', async () => {
    pool = new ServerPool();
    await pool.connectAll(validConfig);

    const results = pool.grepTools('zzz_nonexistent_zzz');
    expect(results).toHaveLength(0);
  });

  it('grepTools normalizes BRE alternation to JS regex', async () => {
    pool = new ServerPool();
    await pool.connectAll(validConfig);

    // BRE-style \| should work as alternation (same as JS |)
    const breResults = pool.grepTools('echo\\|add');
    const jsResults = pool.grepTools('echo|add');
    expect(breResults.length).toBeGreaterThan(0);
    expect(breResults).toEqual(jsResults);
  });

  it('grepTools normalizes BRE grouping to JS regex', async () => {
    pool = new ServerPool();
    await pool.connectAll(validConfig);

    // BRE-style \( \) should work as grouping
    const breResults = pool.grepTools('\\(echo\\|add\\)');
    const jsResults = pool.grepTools('(echo|add)');
    expect(breResults.length).toBeGreaterThan(0);
    expect(breResults).toEqual(jsResults);
  });

  it('handles mixed success and failure in connectAll', async () => {
    pool = new ServerPool();
    const mixedConfig: TooldConfig = {
      mcpServers: {
        everything: {
          command: 'node',
          args: ['node_modules/@modelcontextprotocol/server-everything/dist/index.js', 'stdio'],
        },
        bad: {
          command: 'nonexistent-command-that-does-not-exist',
        },
      },
    };

    await pool.connectAll(mixedConfig);

    const servers = pool.listServers();
    expect(servers).toHaveLength(2);

    const everything = servers.find((s) => s.name === 'everything');
    const bad = servers.find((s) => s.name === 'bad');

    expect(everything!.status).toBe('connected');
    expect(bad!.status).toBe('error');
  });
});
