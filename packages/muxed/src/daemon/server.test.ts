import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { ServerPool } from '../core/server-pool.js';
import type { MuxedConfig } from '../core/types.js';
import { createDaemonServer, type DaemonServer } from './server.js';

const testDir = path.join(os.tmpdir(), 'muxed-server-test');
const testSocketPath = path.join(testDir, 'muxed.sock');
const testPidPath = path.join(testDir, 'muxed.pid');

const testLogPath = path.join(testDir, 'muxed.log');

vi.mock('../utils/paths.js', () => ({
  getPidPath: () => testPidPath,
  getSocketPath: () => testSocketPath,
  getMuxedDir: () => testDir,
  getLogPath: () => testLogPath,
  ensureMuxedDir: () => fs.mkdirSync(testDir, { recursive: true }),
}));

const validConfig: MuxedConfig = {
  mcpServers: {
    everything: {
      command: 'node',
      args: ['node_modules/@modelcontextprotocol/server-everything/dist/index.js', 'stdio'],
    },
  },
  daemon: {
    idleTimeout: 0, // Disable idle timeout for tests
    connectTimeout: 30_000,
    requestTimeout: 60_000,
  },
};

function sendRequest(
  socketPath: string,
  request: Record<string, unknown>
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(socketPath);
    let data = '';

    client.on('connect', () => {
      client.write(JSON.stringify(request) + '\n');
    });

    client.on('data', (chunk) => {
      data += chunk.toString();
      const lines = data.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          try {
            const parsed = JSON.parse(trimmed);
            client.destroy();
            resolve(parsed as Record<string, unknown>);
            return;
          } catch {
            // Not complete yet
          }
        }
      }
    });

    client.on('error', reject);

    setTimeout(() => {
      client.destroy();
      reject(new Error('Timeout waiting for response'));
    }, 10_000);
  });
}

describe('createDaemonServer', () => {
  let pool: ServerPool;
  let daemon: DaemonServer;

  beforeEach(async () => {
    fs.mkdirSync(testDir, { recursive: true });
    pool = new ServerPool();
    await pool.connectAll(validConfig);

    // Wait for server to be listening
    daemon = createDaemonServer(pool, validConfig);
    await new Promise<void>((resolve) => {
      if (daemon.server.listening) {
        resolve();
      } else {
        daemon.server.on('listening', resolve);
      }
    });
  });

  afterEach(async () => {
    daemon.server.close();
    await pool.disconnectAll().catch(() => {});
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('responds to servers/list', async () => {
    const response = await sendRequest(testSocketPath, {
      jsonrpc: '2.0',
      id: 1,
      method: 'servers/list',
      params: {},
    });

    expect(response.jsonrpc).toBe('2.0');
    expect(response.id).toBe(1);
    expect(response.error).toBeUndefined();
    const result = response.result as Array<{ name: string; status: string }>;
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('everything');
    expect(result[0]!.status).toBe('connected');
  });

  it('responds to tools/list', async () => {
    const response = await sendRequest(testSocketPath, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    });

    expect(response.error).toBeUndefined();
    const result = response.result as Array<{ server: string; tool: { name: string } }>;
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]!.server).toBe('everything');
  });

  it('responds to tools/call with echo tool', async () => {
    const response = await sendRequest(testSocketPath, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'everything/echo', arguments: { message: 'hello' } },
    });

    expect(response.error).toBeUndefined();
    const result = response.result as { content: Array<{ type: string; text: string }> };
    expect(result.content).toBeDefined();
    expect(result.content[0]!.text).toContain('hello');
  });

  it('responds to tools/info', async () => {
    const response = await sendRequest(testSocketPath, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/info',
      params: { name: 'everything/echo' },
    });

    expect(response.error).toBeUndefined();
    const result = response.result as { name: string; inputSchema: unknown };
    expect(result.name).toBe('echo');
    expect(result.inputSchema).toBeDefined();
  });

  it('responds to daemon/status', async () => {
    const response = await sendRequest(testSocketPath, {
      jsonrpc: '2.0',
      id: 5,
      method: 'daemon/status',
      params: {},
    });

    expect(response.error).toBeUndefined();
    const result = response.result as {
      pid: number;
      uptime: number;
      serverCount: number;
      servers: unknown[];
    };
    expect(result.pid).toBe(process.pid);
    expect(result.uptime).toBeGreaterThanOrEqual(0);
    expect(result.serverCount).toBe(1);
    expect(result.servers).toHaveLength(1);
  });

  it('returns error for unknown method', async () => {
    const response = await sendRequest(testSocketPath, {
      jsonrpc: '2.0',
      id: 6,
      method: 'unknown/method',
      params: {},
    });

    expect(response.result).toBeUndefined();
    const error = response.error as { code: number; message: string };
    expect(error.code).toBe(-32601);
    expect(error.message).toContain('Method not found');
  });

  it('returns error for invalid JSON', async () => {
    const response = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const client = net.createConnection(testSocketPath);
      let data = '';

      client.on('connect', () => {
        client.write('not valid json\n');
      });

      client.on('data', (chunk) => {
        data += chunk.toString();
        const lines = data.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) {
            try {
              const parsed = JSON.parse(trimmed);
              client.destroy();
              resolve(parsed as Record<string, unknown>);
              return;
            } catch {
              // not complete yet
            }
          }
        }
      });

      client.on('error', reject);
      setTimeout(() => {
        client.destroy();
        reject(new Error('Timeout'));
      }, 5000);
    });

    const error = response.error as { code: number; message: string };
    expect(error.code).toBe(-32700);
    expect(error.message).toBe('Parse error');
  });

  it('returns error for tool not found on tools/call', async () => {
    const response = await sendRequest(testSocketPath, {
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: { name: 'nonexistent/tool' },
    });

    const error = response.error as { code: number; message: string; data?: unknown };
    expect(error.code).toBe(-32602);
    expect(error.message).toContain('Server not found: nonexistent');
    // Structured error should include suggestion data
    expect(error.data).toBeDefined();
    const data = error.data as { code: string; suggestion: string };
    expect(data.code).toBe('SERVER_NOT_FOUND');
    expect(data.suggestion).toBeTruthy();
  });

  it('returns error for tools/call missing name param', async () => {
    const response = await sendRequest(testSocketPath, {
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: {},
    });

    const error = response.error as { code: number; message: string };
    expect(error.code).toBe(-32602);
    expect(error.message).toContain('Missing required parameter');
  });

  it('returns structured error for tool not found on known server', async () => {
    const response = await sendRequest(testSocketPath, {
      jsonrpc: '2.0',
      id: 10,
      method: 'tools/call',
      params: { name: 'everything/nonexistent_tool' },
    });

    const error = response.error as { code: number; message: string; data?: unknown };
    expect(error.code).toBe(-32602);
    expect(error.message).toContain('Tool not found: everything/nonexistent_tool');
    const data = error.data as { code: string; suggestion: string };
    expect(data.code).toBe('TOOL_NOT_FOUND');
    expect(data.suggestion).toBeTruthy();
  });

  it('responds to tools/validate with valid args', async () => {
    const response = await sendRequest(testSocketPath, {
      jsonrpc: '2.0',
      id: 11,
      method: 'tools/validate',
      params: { name: 'everything/echo', arguments: { message: 'hello' } },
    });

    expect(response.error).toBeUndefined();
    const result = response.result as { valid: boolean; errors: string[]; warnings: string[] };
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('responds to tools/validate with missing required field', async () => {
    const response = await sendRequest(testSocketPath, {
      jsonrpc: '2.0',
      id: 12,
      method: 'tools/validate',
      params: { name: 'everything/echo', arguments: {} },
    });

    expect(response.error).toBeUndefined();
    const result = response.result as { valid: boolean; errors: string[]; warnings: string[] };
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects tools/call with invalid arguments via Zod validation', async () => {
    const response = await sendRequest(testSocketPath, {
      jsonrpc: '2.0',
      id: 13,
      method: 'tools/call',
      params: { name: 'everything/echo', arguments: {} },
    });

    const error = response.error as { code: number; message: string; data?: unknown };
    expect(error.code).toBe(-32602);
    expect(error.message).toContain('Invalid arguments');
    const data = error.data as { code: string };
    expect(data.code).toBe('INVALID_ARGUMENTS');
  });

  it('returns error for tools/info with nonexistent tool', async () => {
    const response = await sendRequest(testSocketPath, {
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/info',
      params: { name: 'nonexistent/tool' },
    });

    const error = response.error as { code: number; message: string; data?: unknown };
    expect(error.code).toBe(-32602);
    expect(error.message).toContain('Server not found: nonexistent');
    const data = error.data as { code: string; suggestion: string };
    expect(data.code).toBe('SERVER_NOT_FOUND');
    expect(data.suggestion).toBeTruthy();
  });
});
