import { describe, it, expect } from 'vitest';
import { isStdioConfig, isHttpConfig } from './types.js';
import type { ServerConfig } from './types.js';

describe('isStdioConfig', () => {
  it('returns true for stdio config', () => {
    const config: ServerConfig = { command: 'npx', args: ['-y', 'server'] };
    expect(isStdioConfig(config)).toBe(true);
  });

  it('returns false for HTTP config', () => {
    const config: ServerConfig = { url: 'https://example.com/mcp' };
    expect(isStdioConfig(config)).toBe(false);
  });
});

describe('isHttpConfig', () => {
  it('returns true for HTTP config', () => {
    const config: ServerConfig = { url: 'https://example.com/mcp', transport: 'sse' };
    expect(isHttpConfig(config)).toBe(true);
  });

  it('returns false for stdio config', () => {
    const config: ServerConfig = { command: 'node', args: ['server.js'] };
    expect(isHttpConfig(config)).toBe(false);
  });

  it('returns true for HTTP config with sessionId and reconnection', () => {
    const config: ServerConfig = {
      url: 'https://example.com/mcp',
      sessionId: 'test-session',
      reconnection: { maxDelay: 5000, initialDelay: 500 },
    };
    expect(isHttpConfig(config)).toBe(true);
  });
});
