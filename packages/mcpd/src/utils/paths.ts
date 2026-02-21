import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export function getMcpdDir(): string {
  return path.join(os.homedir(), '.mcpd');
}

export function getSocketPath(): string {
  return path.join(getMcpdDir(), 'mcpd.sock');
}

export function getPidPath(): string {
  return path.join(getMcpdDir(), 'mcpd.pid');
}

export function getLogPath(): string {
  return path.join(getMcpdDir(), 'mcpd.log');
}

export function ensureMcpdDir(): void {
  fs.mkdirSync(getMcpdDir(), { recursive: true });
}
