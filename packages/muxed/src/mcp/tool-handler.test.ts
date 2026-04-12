import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleToolCommand } from './tool-handler.js';

vi.mock('../client/socket.js', () => ({
  sendRequest: vi.fn(),
  MuxedError: class MuxedError extends Error {
    readonly code: number;
    readonly data?: unknown;
    constructor(code: number, message: string, data?: unknown) {
      super(message);
      this.name = 'MuxedError';
      this.code = code;
      this.data = data;
    }
  },
}));

import { sendRequest } from '../client/socket.js';
import { MuxedError } from '../client/socket.js';

const mockSendRequest = vi.mocked(sendRequest);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('handleToolCommand', () => {
  describe('command parsing', () => {
    it('parses single-word commands', async () => {
      mockSendRequest.mockResolvedValue([]);
      await handleToolCommand('servers');
      expect(mockSendRequest).toHaveBeenCalledWith('servers/list');
    });

    it('parses commands with arguments', async () => {
      mockSendRequest.mockResolvedValue([]);
      await handleToolCommand('grep weather');
      expect(mockSendRequest).toHaveBeenCalledWith('tools/grep', { pattern: 'weather' });
    });

    it('trims whitespace', async () => {
      mockSendRequest.mockResolvedValue([]);
      await handleToolCommand('  servers  ');
      expect(mockSendRequest).toHaveBeenCalledWith('servers/list');
    });
  });

  describe('servers', () => {
    it('calls servers/list and returns JSON', async () => {
      const servers = [{ name: 'slack', status: 'connected' }];
      mockSendRequest.mockResolvedValue(servers);

      const result = await handleToolCommand('servers');
      expect(mockSendRequest).toHaveBeenCalledWith('servers/list');
      expect(result.content[0]!.text).toBe(JSON.stringify(servers, null, 2));
      expect(result.isError).toBeUndefined();
    });
  });

  describe('tools', () => {
    it('lists all tools without server filter', async () => {
      mockSendRequest.mockResolvedValue([]);
      await handleToolCommand('tools');
      expect(mockSendRequest).toHaveBeenCalledWith('tools/list', {});
    });

    it('lists tools filtered by server', async () => {
      mockSendRequest.mockResolvedValue([]);
      await handleToolCommand('tools slack');
      expect(mockSendRequest).toHaveBeenCalledWith('tools/list', { server: 'slack' });
    });

    it('passes --include schema flag', async () => {
      mockSendRequest.mockResolvedValue([]);
      await handleToolCommand('tools --include schema');
      expect(mockSendRequest).toHaveBeenCalledWith('tools/list', { includeSchema: true });
    });

    it('passes --include schema with server filter', async () => {
      mockSendRequest.mockResolvedValue([]);
      await handleToolCommand('tools slack --include schema');
      expect(mockSendRequest).toHaveBeenCalledWith('tools/list', {
        server: 'slack',
        includeSchema: true,
      });
    });

    it('passes --depth flag', async () => {
      mockSendRequest.mockResolvedValue([]);
      await handleToolCommand('tools --include schema --depth 2');
      expect(mockSendRequest).toHaveBeenCalledWith('tools/list', {
        includeSchema: true,
        schemaDepth: 2,
      });
    });
  });

  describe('grep', () => {
    it('searches with pattern', async () => {
      mockSendRequest.mockResolvedValue([{ server: 'slack', tool: { name: 'search' } }]);
      const result = await handleToolCommand('grep weather');
      expect(mockSendRequest).toHaveBeenCalledWith('tools/grep', { pattern: 'weather' });
      expect(result.isError).toBeUndefined();
    });

    it('returns error without pattern', async () => {
      const result = await handleToolCommand('grep');
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain('Usage');
    });

    it('passes --include schema flag', async () => {
      mockSendRequest.mockResolvedValue([]);
      await handleToolCommand('grep weather --include schema');
      expect(mockSendRequest).toHaveBeenCalledWith('tools/grep', {
        pattern: 'weather',
        includeSchema: true,
      });
    });

    it('passes --depth flag', async () => {
      mockSendRequest.mockResolvedValue([]);
      await handleToolCommand('grep weather --include schema --depth 1');
      expect(mockSendRequest).toHaveBeenCalledWith('tools/grep', {
        pattern: 'weather',
        includeSchema: true,
        schemaDepth: 1,
      });
    });
  });

  describe('info', () => {
    it('gets tool info', async () => {
      mockSendRequest.mockResolvedValue({ name: 'search', inputSchema: {} });
      await handleToolCommand('info slack/search');
      expect(mockSendRequest).toHaveBeenCalledWith('tools/info', { name: 'slack/search' });
    });

    it('returns error without name', async () => {
      const result = await handleToolCommand('info');
      expect(result.isError).toBe(true);
    });

    it('passes --path flag', async () => {
      mockSendRequest.mockResolvedValue({ name: 'search', inputSchema: {} });
      await handleToolCommand('info slack/search --path filters.tags');
      expect(mockSendRequest).toHaveBeenCalledWith('tools/info', {
        name: 'slack/search',
        path: 'filters.tags',
      });
    });

    it('passes --depth flag', async () => {
      mockSendRequest.mockResolvedValue({ name: 'search', inputSchema: {} });
      await handleToolCommand('info slack/search --depth 1');
      expect(mockSendRequest).toHaveBeenCalledWith('tools/info', {
        name: 'slack/search',
        schemaDepth: 1,
      });
    });

    it('passes both --path and --depth flags', async () => {
      mockSendRequest.mockResolvedValue({ name: 'search', inputSchema: {} });
      await handleToolCommand('info slack/search --path filters --depth 2');
      expect(mockSendRequest).toHaveBeenCalledWith('tools/info', {
        name: 'slack/search',
        path: 'filters',
        schemaDepth: 2,
      });
    });
  });

  describe('call', () => {
    it('calls tool with input parameter', async () => {
      const callResult = { content: [{ type: 'text', text: 'result' }] };
      mockSendRequest.mockResolvedValue(callResult);

      const result = await handleToolCommand('call slack/search', { query: 'test' });
      expect(mockSendRequest).toHaveBeenCalledWith('tools/call', {
        name: 'slack/search',
        args: { query: 'test' },
      });
      expect(result).toEqual(callResult);
    });

    it('passes through daemon content response', async () => {
      const callResult = {
        content: [
          { type: 'text', text: 'hello' },
          { type: 'image', data: 'base64...' },
        ],
      };
      mockSendRequest.mockResolvedValue(callResult);

      const result = await handleToolCommand('call slack/search', {});
      expect(result).toEqual(callResult);
    });

    it('defaults to empty args when no input provided', async () => {
      mockSendRequest.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
      await handleToolCommand('call slack/search');
      expect(mockSendRequest).toHaveBeenCalledWith('tools/call', {
        name: 'slack/search',
        args: {},
      });
    });

    it('returns error without tool name', async () => {
      const result = await handleToolCommand('call');
      expect(result.isError).toBe(true);
    });

    it('wraps non-content results as JSON', async () => {
      mockSendRequest.mockResolvedValue({ data: 'raw' });
      const result = await handleToolCommand('call slack/search');
      expect(result.content[0]!.text).toBe(JSON.stringify({ data: 'raw' }, null, 2));
    });
  });

  describe('resources', () => {
    it('lists all resources', async () => {
      mockSendRequest.mockResolvedValue([]);
      await handleToolCommand('resources');
      expect(mockSendRequest).toHaveBeenCalledWith('resources/list', {});
    });

    it('lists resources filtered by server', async () => {
      mockSendRequest.mockResolvedValue([]);
      await handleToolCommand('resources files');
      expect(mockSendRequest).toHaveBeenCalledWith('resources/list', { server: 'files' });
    });
  });

  describe('read', () => {
    it('reads a resource', async () => {
      mockSendRequest.mockResolvedValue({ contents: 'file content' });
      await handleToolCommand('read files/readme');
      expect(mockSendRequest).toHaveBeenCalledWith('resources/read', { name: 'files/readme' });
    });

    it('returns error without name', async () => {
      const result = await handleToolCommand('read');
      expect(result.isError).toBe(true);
    });
  });

  describe('unknown command', () => {
    it('returns error for unknown subcommand', async () => {
      const result = await handleToolCommand('unknown');
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain('Unknown command');
      expect(result.content[0]!.text).toContain('unknown');
    });
  });

  describe('error handling', () => {
    it('catches MuxedError and returns error result', async () => {
      mockSendRequest.mockRejectedValue(new MuxedError(-32001, 'Tool not found'));
      const result = await handleToolCommand('info slack/search');
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toBe('Tool not found');
    });

    it('catches generic errors', async () => {
      mockSendRequest.mockRejectedValue(new Error('Connection refused'));
      const result = await handleToolCommand('servers');
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain('Connection refused');
    });
  });
});
