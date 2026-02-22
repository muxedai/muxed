import { describe, it, expect } from 'vitest';
import { McpdError } from './socket.js';

describe('McpdError', () => {
  it('extends Error', () => {
    const err = new McpdError(-32602, 'Invalid params');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(McpdError);
  });

  it('stores code, message, and data', () => {
    const err = new McpdError(-32602, 'Invalid params', { field: 'name' });
    expect(err.code).toBe(-32602);
    expect(err.message).toBe('Invalid params');
    expect(err.data).toEqual({ field: 'name' });
    expect(err.name).toBe('McpdError');
  });

  it('data is optional', () => {
    const err = new McpdError(-32601, 'Method not found');
    expect(err.data).toBeUndefined();
  });
});
