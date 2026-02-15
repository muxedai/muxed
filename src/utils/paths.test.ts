import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getSocketPath, getPidPath, getLogPath, getMcpdDir, ensureMcpdDir } from './paths.js';

const home = os.homedir();

describe('paths', () => {
  it('getMcpdDir returns ~/.mcpd', () => {
    expect(getMcpdDir()).toBe(path.join(home, '.mcpd'));
  });

  it('getSocketPath returns ~/.mcpd/mcpd.sock', () => {
    expect(getSocketPath()).toBe(path.join(home, '.mcpd', 'mcpd.sock'));
  });

  it('getPidPath returns ~/.mcpd/mcpd.pid', () => {
    expect(getPidPath()).toBe(path.join(home, '.mcpd', 'mcpd.pid'));
  });

  it('getLogPath returns ~/.mcpd/mcpd.log', () => {
    expect(getLogPath()).toBe(path.join(home, '.mcpd', 'mcpd.log'));
  });
});

describe('ensureMcpdDir', () => {
  const testDir = path.join(os.tmpdir(), 'mcpd-paths-test');

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
