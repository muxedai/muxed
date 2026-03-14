import { describe, it, expect } from 'vitest';
import {
  findSimilarTools,
  toolNotFoundError,
  serverNotFoundError,
  invalidFormatError,
  missingParameterError,
  toErrorData,
  ErrorCode,
} from './errors.js';

describe('findSimilarTools', () => {
  const tools = [
    { server: 'slack', tool: { name: 'search_messages' } },
    { server: 'slack', tool: { name: 'search_files' } },
    { server: 'slack', tool: { name: 'send_message' } },
    { server: 'github', tool: { name: 'search_issues' } },
  ] as Array<{
    server: string;
    tool: { name: string; description?: string; inputSchema: unknown };
  }>;

  it('finds similar tool names', () => {
    const similar = findSimilarTools('slack/search_msgs', tools);
    expect(similar.length).toBeGreaterThan(0);
    expect(similar).toContain('slack/search_messages');
  });

  it('returns empty array for completely different names', () => {
    const similar = findSimilarTools('zzzzzzzzzzzzz', tools);
    expect(similar).toHaveLength(0);
  });

  it('limits results to maxResults', () => {
    const similar = findSimilarTools('slack/search', tools, 2);
    expect(similar.length).toBeLessThanOrEqual(2);
  });
});

describe('error builders', () => {
  it('toolNotFoundError includes suggestions', () => {
    const err = toolNotFoundError('slack/search_msgs', ['slack/search_messages']);
    expect(err.code).toBe(ErrorCode.TOOL_NOT_FOUND);
    expect(err.message).toContain('slack/search_msgs');
    expect(err.suggestion).toContain('slack/search_messages');
    expect(err.context?.similarTools).toContain('slack/search_messages');
  });

  it('toolNotFoundError without similar tools suggests grep', () => {
    const err = toolNotFoundError('zzz/zzz', []);
    expect(err.suggestion).toContain('muxed grep');
  });

  it('serverNotFoundError lists available servers', () => {
    const err = serverNotFoundError('bad', ['good1', 'good2']);
    expect(err.code).toBe(ErrorCode.SERVER_NOT_FOUND);
    expect(err.suggestion).toContain('good1');
  });

  it('invalidFormatError suggests correct format', () => {
    const err = invalidFormatError('noslash');
    expect(err.code).toBe(ErrorCode.INVALID_FORMAT);
    expect(err.suggestion).toContain('server/tool');
  });

  it('missingParameterError includes param name', () => {
    const err = missingParameterError('name');
    expect(err.code).toBe(ErrorCode.MISSING_PARAMETER);
    expect(err.suggestion).toContain('name');
  });

  it('toErrorData converts to JSON-RPC data format', () => {
    const err = toolNotFoundError('slack/search_msgs', ['slack/search_messages']);
    const data = toErrorData(err);
    expect(data.code).toBe(ErrorCode.TOOL_NOT_FOUND);
    expect(data.suggestion).toBeTruthy();
    expect(data.context).toBeDefined();
  });
});
