import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getDaemonPid, isDaemonRunning, cleanupStaleFiles } from './process.js';

// Use a temp directory for test isolation
const testDir = path.join(os.tmpdir(), 'muxed-process-test');
const testPidPath = path.join(testDir, 'muxed.pid');
const testSocketPath = path.join(testDir, 'muxed.sock');

vi.mock('../utils/paths.js', () => ({
  getPidPath: () => testPidPath,
  getSocketPath: () => testSocketPath,
  getMuxedDir: () => testDir,
  ensureMuxedDir: () => fs.mkdirSync(testDir, { recursive: true }),
}));

describe('getDaemonPid', () => {
  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('returns null when no PID file exists', () => {
    expect(getDaemonPid()).toBeNull();
  });

  it('returns pid from valid PID file', () => {
    fs.writeFileSync(testPidPath, '12345');
    expect(getDaemonPid()).toBe(12345);
  });

  it('returns null for invalid PID content', () => {
    fs.writeFileSync(testPidPath, 'not-a-number');
    expect(getDaemonPid()).toBeNull();
  });

  it('returns null for empty PID file', () => {
    fs.writeFileSync(testPidPath, '');
    expect(getDaemonPid()).toBeNull();
  });

  it('returns null for negative PID', () => {
    fs.writeFileSync(testPidPath, '-1');
    expect(getDaemonPid()).toBeNull();
  });
});

describe('isDaemonRunning', () => {
  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('returns false when no PID file exists', async () => {
    expect(await isDaemonRunning()).toBe(false);
  });

  it('returns false when PID file has dead process', async () => {
    // Use a PID that is almost certainly not running
    fs.writeFileSync(testPidPath, '999999');
    expect(await isDaemonRunning()).toBe(false);
  });
});

describe('cleanupStaleFiles', () => {
  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('removes stale PID and socket files when process is dead', async () => {
    fs.writeFileSync(testPidPath, '999999');
    fs.writeFileSync(testSocketPath, '');

    await cleanupStaleFiles();

    expect(fs.existsSync(testPidPath)).toBe(false);
    expect(fs.existsSync(testSocketPath)).toBe(false);
  });

  it('removes orphaned socket file when no PID file exists', async () => {
    fs.writeFileSync(testSocketPath, '');

    await cleanupStaleFiles();

    expect(fs.existsSync(testSocketPath)).toBe(false);
  });

  it('does nothing when no stale files exist', async () => {
    await expect(cleanupStaleFiles()).resolves.toBeUndefined();
  });
});
