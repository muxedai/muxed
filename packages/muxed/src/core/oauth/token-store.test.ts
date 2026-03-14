import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TokenStore } from './token-store.js';

// Redirect auth dir to a temp directory
const tmpDir = path.join(os.tmpdir(), 'muxed-token-store-test');
vi.mock('../../utils/paths.js', () => ({
  getMuxedDir: () => tmpDir,
}));

function authDir() {
  return path.join(tmpDir, 'auth');
}

function sanitize(name: string) {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function hash8(name: string) {
  return crypto.createHash('sha256').update(name).digest('hex').slice(0, 8);
}

function storePath(name: string) {
  return path.join(authDir(), `${sanitize(name)}-${hash8(name)}.json`);
}

beforeEach(() => {
  fs.mkdirSync(authDir(), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('TokenStore collision prevention', () => {
  it('produces different store paths for names that sanitize identically', () => {
    const a = new TokenStore('my.server');
    const b = new TokenStore('my/server');

    a.saveTokens({ access_token: 'a', token_type: 'bearer' });
    b.saveTokens({ access_token: 'b', token_type: 'bearer' });

    expect(a.getTokens()?.access_token).toBe('a');
    expect(b.getTokens()?.access_token).toBe('b');
  });

  it('creates files with hash suffix', () => {
    const store = new TokenStore('my.server');
    store.saveTokens({ access_token: 'tok', token_type: 'bearer' });

    expect(fs.existsSync(storePath('my.server'))).toBe(true);
  });
});

describe('TokenStore clearAll', () => {
  it('removes the store file', () => {
    const name = 'clear-test';
    const store = new TokenStore(name);
    store.saveTokens({ access_token: 'tok', token_type: 'bearer' });
    expect(fs.existsSync(storePath(name))).toBe(true);

    store.clearAll();
    expect(fs.existsSync(storePath(name))).toBe(false);
  });
});

describe('TokenStore hash stability', () => {
  it('produces the same hash for the same name across calls', () => {
    const store1 = new TokenStore('stable-name');
    store1.saveTokens({ access_token: 'tok1', token_type: 'bearer' });

    const store2 = new TokenStore('stable-name');
    expect(store2.getTokens()?.access_token).toBe('tok1');
  });
});
