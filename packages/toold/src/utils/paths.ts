import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export function getTooldDir(): string {
  return path.join(os.homedir(), '.toold');
}

export function getSocketPath(): string {
  return path.join(getTooldDir(), 'toold.sock');
}

export function getPidPath(): string {
  return path.join(getTooldDir(), 'toold.pid');
}

export function getLogPath(): string {
  return path.join(getTooldDir(), 'toold.log');
}

export function ensureTooldDir(): void {
  fs.mkdirSync(getTooldDir(), { recursive: true });
}
