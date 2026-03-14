import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { PostHog } from 'posthog-node';

const ID_FILE = path.join(os.homedir(), '.config', 'muxed', '.analytics_id');

function getOrCreateDistinctId(): string {
  try {
    if (fs.existsSync(ID_FILE)) {
      return fs.readFileSync(ID_FILE, 'utf-8').trim();
    }
    const id = crypto.randomUUID();
    fs.mkdirSync(path.dirname(ID_FILE), { recursive: true });
    fs.writeFileSync(ID_FILE, id, 'utf-8');
    return id;
  } catch {
    return 'anonymous';
  }
}

let _client: PostHog | null = null;

function getClient(): PostHog | null {
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
    const distinctId = getOrCreateDistinctId();
    client.capture({ distinctId, event, properties: properties ?? {} });
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
