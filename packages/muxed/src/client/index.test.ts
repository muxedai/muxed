import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MuxedClient, MuxedError, createClient } from './index.js';

// Mock the socket module
vi.mock('./socket.js', () => {
  const MuxedError = class MuxedError extends Error {
    readonly code: number;
    readonly data?: unknown;
    constructor(code: number, message: string, data?: unknown) {
      super(message);
      this.name = 'MuxedError';
      this.code = code;
      this.data = data;
    }
  };

  return {
    ensureDaemon: vi.fn(),
    sendRequest: vi.fn(),
    MuxedError,
  };
});

let mockSendRequest: ReturnType<typeof vi.fn>;
let mockEnsureDaemon: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.clearAllMocks();
  const socketModule = await import('./socket.js');
  mockSendRequest = socketModule.sendRequest as ReturnType<typeof vi.fn>;
  mockEnsureDaemon = socketModule.ensureDaemon as ReturnType<typeof vi.fn>;
});

describe('createClient', () => {
  it('calls ensureDaemon by default', async () => {
    await createClient();
    expect(mockEnsureDaemon).toHaveBeenCalledOnce();
  });

  it('passes configPath to ensureDaemon', async () => {
    await createClient({ configPath: '/tmp/config.json' });
    expect(mockEnsureDaemon).toHaveBeenCalledWith('/tmp/config.json');
  });

  it('skips ensureDaemon when autoStart is false', async () => {
    await createClient({ autoStart: false });
    expect(mockEnsureDaemon).not.toHaveBeenCalled();
  });

  it('returns an MuxedClient instance', async () => {
    const client = await createClient();
    expect(client).toBeInstanceOf(MuxedClient);
  });
});

describe('MuxedClient', () => {
  let client: MuxedClient;

  beforeEach(async () => {
    client = await createClient({ autoStart: false });
  });

  // --- Servers ---

  it('servers() calls servers/list', async () => {
    const mockResult = [{ name: 'test', status: 'connected' }];
    mockSendRequest.mockResolvedValue(mockResult);

    const result = await client.servers();
    expect(mockSendRequest).toHaveBeenCalledWith('servers/list');
    expect(result).toEqual(mockResult);
  });

  // --- Tools ---

  it('tools() calls tools/list without server', async () => {
    const mockResult = [{ server: 'fs', tool: { name: 'read' } }];
    mockSendRequest.mockResolvedValue(mockResult);

    const result = await client.tools();
    expect(mockSendRequest).toHaveBeenCalledWith('tools/list', undefined);
    expect(result).toEqual(mockResult);
  });

  it('tools(server) calls tools/list with server filter', async () => {
    mockSendRequest.mockResolvedValue([]);

    await client.tools('my-server');
    expect(mockSendRequest).toHaveBeenCalledWith('tools/list', { server: 'my-server' });
  });

  it('tool() calls tools/info', async () => {
    const mockTool = { name: 'read_file', description: 'Read a file' };
    mockSendRequest.mockResolvedValue(mockTool);

    const result = await client.tool('read_file');
    expect(mockSendRequest).toHaveBeenCalledWith('tools/info', { name: 'read_file' });
    expect(result).toEqual(mockTool);
  });

  it('grep() calls tools/grep', async () => {
    const mockResult = [{ server: 'fs', tool: { name: 'search' } }];
    mockSendRequest.mockResolvedValue(mockResult);

    const result = await client.grep('search');
    expect(mockSendRequest).toHaveBeenCalledWith('tools/grep', { pattern: 'search' });
    expect(result).toEqual(mockResult);
  });

  it('call() passes name and arguments', async () => {
    mockSendRequest.mockResolvedValue({ content: [{ type: 'text', text: 'hello' }] });

    const result = await client.call('server/tool', { key: 'value' });
    expect(mockSendRequest).toHaveBeenCalledWith('tools/call', {
      name: 'server/tool',
      arguments: { key: 'value' },
    });
    expect(result.content[0]?.text).toBe('hello');
  });

  it('call() passes timeout option', async () => {
    mockSendRequest.mockResolvedValue({ content: [] });

    await client.call('server/tool', { key: 'value' }, { timeout: 5000 });
    expect(mockSendRequest).toHaveBeenCalledWith('tools/call', {
      name: 'server/tool',
      arguments: { key: 'value' },
      timeout: 5000,
    });
  });

  it('call() defaults arguments to empty object', async () => {
    mockSendRequest.mockResolvedValue({ content: [] });

    await client.call('server/tool');
    expect(mockSendRequest).toHaveBeenCalledWith('tools/call', {
      name: 'server/tool',
      arguments: {},
    });
  });

  it('callAsync() calls tools/call-async', async () => {
    const mockHandle = { taskId: 'abc', server: 'test', status: 'running' };
    mockSendRequest.mockResolvedValue(mockHandle);

    const result = await client.callAsync('server/long-tool', { input: 'data' });
    expect(mockSendRequest).toHaveBeenCalledWith('tools/call-async', {
      name: 'server/long-tool',
      arguments: { input: 'data' },
    });
    expect(result).toEqual(mockHandle);
  });

  // --- Resources ---

  it('resources() calls resources/list', async () => {
    const mockResult = [{ server: 'fs', resource: { uri: 'file:///etc/hosts' } }];
    mockSendRequest.mockResolvedValue(mockResult);

    const result = await client.resources();
    expect(mockSendRequest).toHaveBeenCalledWith('resources/list', undefined);
    expect(result).toEqual(mockResult);
  });

  it('resources(server) calls resources/list with server filter', async () => {
    mockSendRequest.mockResolvedValue([]);

    await client.resources('my-server');
    expect(mockSendRequest).toHaveBeenCalledWith('resources/list', { server: 'my-server' });
  });

  it('read() calls resources/read', async () => {
    mockSendRequest.mockResolvedValue({ contents: [{ text: 'content' }] });

    const result = await client.read('fs', 'file:///etc/hosts');
    expect(mockSendRequest).toHaveBeenCalledWith('resources/read', {
      server: 'fs',
      uri: 'file:///etc/hosts',
    });
    expect(result).toBeDefined();
  });

  // --- Prompts ---

  it('prompts() calls prompts/list', async () => {
    const mockResult = [{ server: 'test', prompt: { name: 'summarize' } }];
    mockSendRequest.mockResolvedValue(mockResult);

    const result = await client.prompts();
    expect(mockSendRequest).toHaveBeenCalledWith('prompts/list', undefined);
    expect(result).toEqual(mockResult);
  });

  it('prompt() calls prompts/get', async () => {
    mockSendRequest.mockResolvedValue({ messages: [] });

    await client.prompt('test', 'summarize', { text: 'hello' });
    expect(mockSendRequest).toHaveBeenCalledWith('prompts/get', {
      server: 'test',
      name: 'summarize',
      arguments: { text: 'hello' },
    });
  });

  it('prompt() omits arguments when not provided', async () => {
    mockSendRequest.mockResolvedValue({ messages: [] });

    await client.prompt('test', 'summarize');
    expect(mockSendRequest).toHaveBeenCalledWith('prompts/get', {
      server: 'test',
      name: 'summarize',
    });
  });

  // --- Completions ---

  it('complete() calls completions/complete', async () => {
    mockSendRequest.mockResolvedValue({ completion: { values: ['a', 'b'] } });

    const ref = { type: 'ref/prompt', name: 'summarize' };
    const argument = { name: 'text', value: 'hel' };
    await client.complete('test', ref, argument);
    expect(mockSendRequest).toHaveBeenCalledWith('completions/complete', {
      server: 'test',
      ref,
      argument,
    });
  });

  // --- Tasks ---

  it('tasks() calls tasks/list', async () => {
    mockSendRequest.mockResolvedValue([]);

    await client.tasks();
    expect(mockSendRequest).toHaveBeenCalledWith('tasks/list', undefined);
  });

  it('tasks(server) calls tasks/list with server filter', async () => {
    mockSendRequest.mockResolvedValue([]);

    await client.tasks('my-server');
    expect(mockSendRequest).toHaveBeenCalledWith('tasks/list', { server: 'my-server' });
  });

  it('task() calls tasks/get', async () => {
    mockSendRequest.mockResolvedValue({ status: 'completed' });

    await client.task('test', 'task-123');
    expect(mockSendRequest).toHaveBeenCalledWith('tasks/get', {
      server: 'test',
      taskId: 'task-123',
    });
  });

  it('taskResult() calls tasks/result', async () => {
    mockSendRequest.mockResolvedValue({ content: [] });

    await client.taskResult('test', 'task-123');
    expect(mockSendRequest).toHaveBeenCalledWith('tasks/result', {
      server: 'test',
      taskId: 'task-123',
    });
  });

  it('taskCancel() calls tasks/cancel', async () => {
    mockSendRequest.mockResolvedValue({ cancelled: true });

    await client.taskCancel('test', 'task-123');
    expect(mockSendRequest).toHaveBeenCalledWith('tasks/cancel', {
      server: 'test',
      taskId: 'task-123',
    });
  });

  // --- Daemon ---

  it('status() calls daemon/status', async () => {
    const mockStatus = { pid: 123, uptime: 1000, serverCount: 2, servers: [] };
    mockSendRequest.mockResolvedValue(mockStatus);

    const result = await client.status();
    expect(mockSendRequest).toHaveBeenCalledWith('daemon/status');
    expect(result).toEqual(mockStatus);
  });

  it('reload() calls config/reload', async () => {
    mockSendRequest.mockResolvedValue({ added: [], removed: [], changed: [] });

    await client.reload();
    expect(mockSendRequest).toHaveBeenCalledWith('config/reload', undefined);
  });

  it('reload(configPath) passes configPath', async () => {
    mockSendRequest.mockResolvedValue({ added: [], removed: [], changed: [] });

    await client.reload('/tmp/new-config.json');
    expect(mockSendRequest).toHaveBeenCalledWith('config/reload', {
      configPath: '/tmp/new-config.json',
    });
  });

  it('stop() calls daemon/stop', async () => {
    mockSendRequest.mockResolvedValue({ ok: true });

    await client.stop();
    expect(mockSendRequest).toHaveBeenCalledWith('daemon/stop');
  });

  // --- Lifecycle ---

  it('close() does not throw', () => {
    expect(() => client.close()).not.toThrow();
  });
});

describe('MuxedError', () => {
  it('has code and message properties', () => {
    const err = new MuxedError(-32602, 'Invalid params', { detail: 'missing name' });
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe(-32602);
    expect(err.message).toBe('Invalid params');
    expect(err.data).toEqual({ detail: 'missing name' });
    expect(err.name).toBe('MuxedError');
  });

  it('works without data', () => {
    const err = new MuxedError(-32601, 'Method not found');
    expect(err.code).toBe(-32601);
    expect(err.data).toBeUndefined();
  });
});
