import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let cached: string | null = null;

export function getVersion(): string {
  if (cached) return cached;
  const dir = path.dirname(fileURLToPath(import.meta.url));
  // Handles both bundled (dist/cli.mjs → ../package.json)
  // and source (src/utils/version.ts → ../../package.json)
  for (const rel of ['../package.json', '../../package.json']) {
    const p = path.resolve(dir, rel);
    try {
      const pkg = JSON.parse(fs.readFileSync(p, 'utf-8')) as { name?: string; version?: string };
      if (pkg.name === 'muxed' && pkg.version) {
        cached = pkg.version;
        return cached;
      }
    } catch {
      // try next candidate
    }
  }
  return '0.0.0';
}
