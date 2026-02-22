import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export function getMuxedDir(): string {
  return path.join(os.homedir(), '.muxed');
}

export function getSocketPath(): string {
  return path.join(getMuxedDir(), 'muxed.sock');
}

export function getPidPath(): string {
  return path.join(getMuxedDir(), 'muxed.pid');
}

export function getLogPath(): string {
  return path.join(getMuxedDir(), 'muxed.log');
}

export function ensureMuxedDir(): void {
  fs.mkdirSync(getMuxedDir(), { recursive: true });
}
