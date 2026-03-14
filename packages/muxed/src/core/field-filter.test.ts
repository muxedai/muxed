import { describe, it, expect } from 'vitest';
import { filterFields } from './field-filter.js';

describe('filterFields', () => {
  it('extracts top-level fields', () => {
    const data = { name: 'Alice', age: 30, email: 'alice@example.com' };
    const result = filterFields(data, ['name', 'email']);
    expect(result).toEqual({ name: 'Alice', email: 'alice@example.com' });
  });

  it('extracts nested fields with dot notation', () => {
    const data = { user: { name: 'Alice', age: 30 }, status: 'ok' };
    const result = filterFields(data, ['user.name']);
    expect(result).toEqual({ user: { name: 'Alice' } });
  });

  it('extracts array elements with bracket syntax', () => {
    const data = {
      rows: [
        { name: 'Alice', email: 'alice@example.com' },
        { name: 'Bob', email: 'bob@example.com' },
      ],
    };
    const result = filterFields(data, ['rows[].name']);
    expect(result).toEqual({ rows: { name: ['Alice', 'Bob'] } });
  });

  it('returns original data when no fields match', () => {
    const data = { name: 'Alice' };
    const result = filterFields(data, ['nonexistent']);
    expect(result).toEqual({ name: 'Alice' });
  });

  it('handles structuredContent fallback', () => {
    const data = {
      content: [{ type: 'text', text: 'hello' }],
      structuredContent: { rows: [{ id: 1, name: 'Alice' }] },
    };
    const result = filterFields(data, ['rows[].name']);
    expect(result.structuredContent).toEqual({ rows: { name: ['Alice'] } });
  });

  it('handles text content with embedded JSON', () => {
    const data = {
      content: [{ type: 'text', text: '{"name":"Alice","age":30}' }],
    };
    const result = filterFields(data, ['name']);
    expect(result.content).toEqual([{ type: 'text', text: '{"name":"Alice"}' }]);
  });
});
