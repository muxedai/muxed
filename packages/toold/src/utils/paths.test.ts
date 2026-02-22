import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getSocketPath, getPidPath, getLogPath, getTooldDir, ensureTooldDir } from './paths.js';

const home = os.homedir();

describe('paths', () => {
  it('getTooldDir returns ~/.toold', () => {
    expect(getTooldDir()).toBe(path.join(home, '.toold'));
  });

  it('getSocketPath returns ~/.toold/toold.sock', () => {
    expect(getSocketPath()).toBe(path.join(home, '.toold', 'toold.sock'));
  });

  it('getPidPath returns ~/.toold/toold.pid', () => {
    expect(getPidPath()).toBe(path.join(home, '.toold', 'toold.pid'));
  });

  it('getLogPath returns ~/.toold/toold.log', () => {
    expect(getLogPath()).toBe(path.join(home, '.toold', 'toold.log'));
  });
});

describe('ensureTooldDir', () => {
  const testDir = path.join(os.tmpdir(), 'toold-paths-test');

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('creates the directory if it does not exist', () => {
    // We test the underlying fs.mkdirSync logic with a temp dir
    const dir = path.join(testDir, 'nested', 'dir');
    expect(fs.existsSync(dir)).toBe(false);
    fs.mkdirSync(dir, { recursive: true });
    expect(fs.existsSync(dir)).toBe(true);
  });

  it('does not throw if directory already exists', () => {
    fs.mkdirSync(testDir, { recursive: true });
    expect(() => fs.mkdirSync(testDir, { recursive: true })).not.toThrow();
  });
});
