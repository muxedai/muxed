import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { PostHog } from 'posthog-node';

const TELEMETRY_FILE = path.join(os.homedir(), '.muxed', 'telemetry');

// Random per-session ID — not persisted, not linkable across sessions
const sessionId = crypto.randomUUID();

function isTelemetryEnabled(): boolean {
  // Standard env var (https://consoledonottrack.com)
  if (process.env.DO_NOT_TRACK === '1') return false;
  if (process.env.MUXED_TELEMETRY === '0') return false;

  try {
    if (fs.existsSync(TELEMETRY_FILE)) {
      const value = fs.readFileSync(TELEMETRY_FILE, 'utf-8').trim();
      return value !== 'off';
    }
  } catch {
    // If we can't read the file, default to enabled
  }

  return true;
}

export function setTelemetryEnabled(enabled: boolean): void {
  try {
    const dir = path.dirname(TELEMETRY_FILE);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TELEMETRY_FILE, enabled ? 'on' : 'off', 'utf-8');
  } catch {
    // Best-effort
  }
}

export function getTelemetryStatus(): 'on' | 'off' {
  return isTelemetryEnabled() ? 'on' : 'off';
}

let _client: PostHog | null = null;

function getClient(): PostHog | null {
  if (!isTelemetryEnabled()) return null;
  if (_client) return _client;
  const token = process.env.POSTHOG_PROJECT_TOKEN;
  const host = process.env.POSTHOG_HOST;
  if (!token || !host) return null;
  try {
    _client = new PostHog(token, { host, flushAt: 1 });
    return _client;
  } catch {
    return null;
  }
}

export function capture(event: string, properties?: Record<string, unknown>): void {
  try {
    const client = getClient();
    if (!client) return;
    client.capture({ distinctId: sessionId, event, properties: properties ?? {} });
  } catch {
    // Never break the CLI
  }
}

export async function shutdown(): Promise<void> {
  try {
    if (_client) await _client.shutdown();
  } catch {
    // Ignore
  }
}
