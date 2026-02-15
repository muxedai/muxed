import { describe, it, expect, afterEach } from 'vitest';
import { ServerManager } from './server-manager.js';
import type { StdioServerConfig } from './types.js';

const everythingConfig: StdioServerConfig = {
  command: 'node',
  args: ['node_modules/@modelcontextprotocol/server-everything/dist/index.js', 'stdio'],
};

describe('ServerManager', () => {
  let manager: ServerManager;

  afterEach(async () => {
    if (manager) {
      await manager.disconnect().catch(() => {});
    }
  });

  it('connects to a stdio server and reports connected status', async () => {
    manager = new ServerManager('everything', everythingConfig);
    await manager.connect();
    expect(manager.getStatus()).toBe('connected');
  });

  it('populates serverInfo, capabilities, and protocolVersion after connect', async () => {
    manager = new ServerManager('everything', everythingConfig);
    await manager.connect();

    const state = manager.getState();
    expect(state.serverInfo).toBeDefined();
    expect(state.serverInfo!.name).toBeTruthy();
    expect(state.serverInfo!.version).toBeTruthy();
    expect(state.capabilities).toBeDefined();
    expect(state.capabilities!.tools).toBeDefined();
    expect(state.protocolVersion).toBe('2025-11-25');
  });

  it('lists tools with name and inputSchema', async () => {
    manager = new ServerManager('everything', everythingConfig);
    await manager.connect();

    const tools = manager.listTools();
    expect(tools.length).toBeGreaterThan(0);

    const tool = tools[0]!;
    expect(tool.name).toBeTruthy();
    expect(tool.inputSchema).toBeDefined();
  });

  it('calls the echo tool and receives text content', async () => {
    manager = new ServerManager('everything', everythingConfig);
    await manager.connect();

    const result = await manager.callTool('echo', { message: 'hello' });
    expect('content' in result).toBe(true);

    const content = (result as { content: Array<{ type: string; text?: string }> }).content;
    expect(Array.isArray(content)).toBe(true);

    const textContent = content.find((c) => c.type === 'text');
    expect(textContent).toBeDefined();
    expect(textContent!.text).toContain('hello');
  });

  it('disconnect sets status to closed', async () => {
    manager = new ServerManager('everything', everythingConfig);
    await manager.connect();
    expect(manager.getStatus()).toBe('connected');

    await manager.disconnect();
    expect(manager.getStatus()).toBe('closed');
  });

  it('sets error status when connection fails', async () => {
    manager = new ServerManager('bad', {
      command: 'nonexistent-command-that-does-not-exist',
    });
    await manager.connect();
    expect(manager.getStatus()).toBe('error');
    expect(manager.getState().error).toBeTruthy();
  });
});
