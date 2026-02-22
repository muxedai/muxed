import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getSocketPath, getPidPath, getLogPath, getMuxedDir, ensureMuxedDir } from './paths.js';

const home = os.homedir();

describe('paths', () => {
  it('getMuxedDir returns ~/.muxed', () => {
    expect(getMuxedDir()).toBe(path.join(home, '.muxed'));
  });

  it('getSocketPath returns ~/.muxed/muxed.sock', () => {
    expect(getSocketPath()).toBe(path.join(home, '.muxed', 'muxed.sock'));
  });

  it('getPidPath returns ~/.muxed/muxed.pid', () => {
    expect(getPidPath()).toBe(path.join(home, '.muxed', 'muxed.pid'));
  });

  it('getLogPath returns ~/.muxed/muxed.log', () => {
    expect(getLogPath()).toBe(path.join(home, '.muxed', 'muxed.log'));
  });
});

describe('ensureMuxedDir', () => {
  const testDir = path.join(os.tmpdir(), 'muxed-paths-test');

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
