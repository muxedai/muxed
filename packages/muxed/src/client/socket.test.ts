import { describe, it, expect } from 'vitest';
import { MuxedError } from './socket.js';

describe('MuxedError', () => {
  it('extends Error', () => {
    const err = new MuxedError(-32602, 'Invalid params');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(MuxedError);
  });

  it('stores code, message, and data', () => {
    const err = new MuxedError(-32602, 'Invalid params', { field: 'name' });
    expect(err.code).toBe(-32602);
    expect(err.message).toBe('Invalid params');
    expect(err.data).toEqual({ field: 'name' });
    expect(err.name).toBe('MuxedError');
  });

  it('data is optional', () => {
    const err = new MuxedError(-32601, 'Method not found');
    expect(err.data).toBeUndefined();
  });
});
