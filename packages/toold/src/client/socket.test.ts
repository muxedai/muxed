import { describe, it, expect } from 'vitest';
import { TooldError } from './socket.js';

describe('TooldError', () => {
  it('extends Error', () => {
    const err = new TooldError(-32602, 'Invalid params');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(TooldError);
  });

  it('stores code, message, and data', () => {
    const err = new TooldError(-32602, 'Invalid params', { field: 'name' });
    expect(err.code).toBe(-32602);
    expect(err.message).toBe('Invalid params');
    expect(err.data).toEqual({ field: 'name' });
    expect(err.name).toBe('TooldError');
  });

  it('data is optional', () => {
    const err = new TooldError(-32601, 'Method not found');
    expect(err.data).toBeUndefined();
  });
});
