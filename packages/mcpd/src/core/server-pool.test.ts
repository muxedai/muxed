import { describe, it, expect, afterEach } from 'vitest';
import { ServerPool } from './server-pool.js';
import type { McpdConfig } from './types.js';

const validConfig: McpdConfig = {
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

  it('handles mixed success and failure in connectAll', async () => {
    pool = new ServerPool();
    const mixedConfig: McpdConfig = {
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
