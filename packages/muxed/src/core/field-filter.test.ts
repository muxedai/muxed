import { describe, it, expect } from 'vitest';
import { filterFields } from './field-filter.js';

describe('filterFields', () => {
  it('filters structuredContent fields', () => {
    const data = {
      content: [],
      structuredContent: { name: 'Alice', age: 30, email: 'alice@example.com' },
    };
    const result = filterFields(data, ['name', 'email']);
    expect(result.structuredContent).toEqual({ name: 'Alice', email: 'alice@example.com' });
  });

  it('filters nested structuredContent with dot notation', () => {
    const data = {
      content: [],
      structuredContent: { user: { name: 'Alice', age: 30 }, status: 'ok' },
    };
    const result = filterFields(data, ['user.name']);
    expect(result.structuredContent).toEqual({ user: { name: 'Alice' } });
  });

  it('filters array elements in structuredContent with bracket syntax', () => {
    const data = {
      content: [],
      structuredContent: {
        rows: [
          { name: 'Alice', email: 'alice@example.com' },
          { name: 'Bob', email: 'bob@example.com' },
        ],
      },
    };
    const result = filterFields(data, ['rows[].name']);
    expect(result.structuredContent).toEqual({ rows: { name: ['Alice', 'Bob'] } });
  });

  it('returns original data when no fields match in structuredContent', () => {
    const data = {
      content: [],
      structuredContent: { name: 'Alice' },
    };
    const result = filterFields(data, ['nonexistent']);
    expect(result).toEqual(data);
  });

  it('filters JSON embedded in text content blocks', () => {
    const data = {
      content: [{ type: 'text', text: '{"name":"Alice","age":30}' }],
    };
    const result = filterFields(data, ['name']);
    expect(result.content).toEqual([{ type: 'text', text: '{"name":"Alice"}' }]);
  });

  it('leaves non-JSON text content unchanged', () => {
    const data = {
      content: [{ type: 'text', text: 'Hello, this is plain text output' }],
    };
    const result = filterFields(data, ['name']);
    expect(result).toEqual(data);
  });

  it('leaves image and audio blocks unchanged', () => {
    const data = {
      content: [
        { type: 'image', mimeType: 'image/png', data: 'base64...' },
        { type: 'text', text: '{"id": 1}' },
      ],
    };
    const result = filterFields(data, ['id']);
    const content = result.content as Array<{ type: string; text?: string }>;
    expect(content[0]).toEqual({ type: 'image', mimeType: 'image/png', data: 'base64...' });
    expect(content[1]).toEqual({ type: 'text', text: '{"id":1}' });
  });

  it('prefers structuredContent over text content', () => {
    const data = {
      content: [{ type: 'text', text: '{"name":"TextAlice"}' }],
      structuredContent: { name: 'StructAlice', age: 30 },
    };
    const result = filterFields(data, ['name']);
    expect(result.structuredContent).toEqual({ name: 'StructAlice' });
    // Text content should be untouched since structuredContent matched
    const content = result.content as Array<{ type: string; text?: string }>;
    expect(content[0]!.text).toBe('{"name":"TextAlice"}');
  });

  it('returns data unchanged when content has no JSON-parseable blocks', () => {
    const data = {
      content: [
        { type: 'text', text: 'plain output' },
        { type: 'image', mimeType: 'image/png' },
      ],
    };
    const result = filterFields(data, ['anything']);
    expect(result).toBe(data); // Same reference — unchanged
  });
});
