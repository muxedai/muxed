import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { z } from 'zod/v4';
import type { McpdConfig } from './types.js';

const StdioServerConfigSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  cwd: z.string().optional(),
});

const HttpServerConfigSchema = z.object({
  url: z.string(),
  transport: z.enum(['streamable-http', 'sse']).optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

const ServerConfigSchema = z.union([StdioServerConfigSchema, HttpServerConfigSchema]);

const DaemonConfigSchema = z.object({
  idleTimeout: z.number().optional(),
  connectTimeout: z.number().optional(),
  requestTimeout: z.number().optional(),
});

const McpdConfigSchema = z.object({
  mcpServers: z.record(z.string(), ServerConfigSchema),
  daemon: DaemonConfigSchema.optional(),
});

const DAEMON_DEFAULTS = {
  idleTimeout: 300_000,
  connectTimeout: 30_000,
  requestTimeout: 60_000,
};

function findConfigFile(configPath?: string): string {
  if (configPath) {
    if (!fs.existsSync(configPath)) {
      throw new Error(`Config file not found: ${configPath}`);
    }
    return configPath;
  }

  const cwdConfig = path.join(process.cwd(), 'mcpd.config.json');
  if (fs.existsSync(cwdConfig)) {
    return cwdConfig;
  }

  const homeConfig = path.join(os.homedir(), '.config', 'mcpd', 'config.json');
  if (fs.existsSync(homeConfig)) {
    return homeConfig;
  }

  throw new Error(
    'No config file found. Create mcpd.config.json in the current directory or ~/.config/mcpd/config.json'
  );
}

function validateServerConfigs(config: McpdConfig): void {
  for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
    const hasCommand = 'command' in serverConfig;
    const hasUrl = 'url' in serverConfig;

    if (!hasCommand && !hasUrl) {
      throw new Error(
        `Server "${name}": must have either "command" (stdio) or "url" (HTTP) property`
      );
    }
  }
}

export function loadConfig(configPath?: string): McpdConfig {
  const filePath = findConfigFile(configPath);
  const raw = fs.readFileSync(filePath, 'utf-8');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in config file: ${filePath}`);
  }

  const result = McpdConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid config: ${z.prettifyError(result.error)}`);
  }

  const config = result.data as McpdConfig;

  validateServerConfigs(config);

  // Apply daemon defaults
  config.daemon = {
    ...DAEMON_DEFAULTS,
    ...config.daemon,
  };

  return config;
}
