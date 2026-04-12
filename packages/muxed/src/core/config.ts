import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { z } from 'zod/v4';
import type { MuxedConfig } from './types.js';

const StdioServerConfigSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  cwd: z.string().optional(),
  timeout: z.number().optional(),
});

const ReconnectionSchema = z.object({
  maxDelay: z.number().optional(),
  initialDelay: z.number().optional(),
  growFactor: z.number().optional(),
  maxRetries: z.number().optional(),
});

const ClientCredentialsAuthSchema = z.object({
  type: z.literal('client_credentials'),
  clientId: z.string(),
  clientSecret: z.string(),
  scope: z.string().optional(),
});

const AuthorizationCodeAuthSchema = z.object({
  type: z.literal('authorization_code'),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  scope: z.string().optional(),
  callbackPort: z.number().int().min(0).max(65535).optional(),
});

const OAuthConfigSchema = z.union([ClientCredentialsAuthSchema, AuthorizationCodeAuthSchema]);

const HttpServerConfigSchema = z.object({
  url: z.string(),
  transport: z.enum(['streamable-http', 'sse']).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  sessionId: z.string().optional(),
  reconnection: ReconnectionSchema.optional(),
  auth: OAuthConfigSchema.optional(),
  timeout: z.number().optional(),
});

const ServerConfigSchema = z.union([StdioServerConfigSchema, HttpServerConfigSchema]);

const HttpListenerSchema = z.object({
  enabled: z.boolean().optional(),
  port: z.number().optional(),
  host: z.string().optional(),
});

const DaemonConfigSchema = z.object({
  idleTimeout: z.number().optional(),
  connectTimeout: z.number().optional(),
  requestTimeout: z.number().optional(),
  healthCheckInterval: z.number().optional(),
  healthCheckTimeout: z.number().optional(),
  maxRestartAttempts: z.number().optional(),
  maxTotalTimeout: z.number().optional(),
  taskExpiryTimeout: z.number().optional(),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).optional(),
  shutdownTimeout: z.number().optional(),
  http: HttpListenerSchema.optional(),
});

const MuxedConfigSchema = z.object({
  mcpServers: z.record(z.string(), ServerConfigSchema),
  daemon: DaemonConfigSchema.optional(),
  mergeClaudeConfig: z.boolean().optional(),
});

export function getClaudeDesktopConfigPath(): string | null {
  const platform = os.platform();
  const home = os.homedir();
  if (platform === 'darwin') {
    return path.join(
      home,
      'Library',
      'Application Support',
      'Claude',
      'claude_desktop_config.json'
    );
  }
  if (platform === 'linux') {
    return path.join(home, '.config', 'Claude', 'claude_desktop_config.json');
  }
  return null;
}

function mergeClaudeDesktopServers(servers: Record<string, unknown>): Record<string, unknown> {
  const configPath = getClaudeDesktopConfigPath();
  if (!configPath || !fs.existsSync(configPath)) return servers;

  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
    const claudeServers = raw.mcpServers as Record<string, unknown> | undefined;
    if (!claudeServers || typeof claudeServers !== 'object') return servers;

    // Claude Desktop servers as base, muxed servers take precedence
    return { ...claudeServers, ...servers };
  } catch {
    return servers;
  }
}

const DAEMON_DEFAULTS = {
  idleTimeout: 300_000,
  connectTimeout: 30_000,
  requestTimeout: 30_000,
  healthCheckInterval: 30_000,
  healthCheckTimeout: 10_000,
  maxRestartAttempts: -1,
  maxTotalTimeout: 300_000,
  taskExpiryTimeout: 3_600_000,
  logLevel: 'info' as const,
  shutdownTimeout: 10_000,
};

function getGlobalConfigPath(): string {
  return path.join(os.homedir(), '.muxed', 'config.json');
}

function findConfigFile(configPath?: string): string | null {
  if (configPath) {
    if (!fs.existsSync(configPath)) {
      throw new Error(`Config file not found: ${configPath}`);
    }
    return configPath;
  }

  const cwdConfig = path.join(process.cwd(), 'muxed.config.json');
  if (fs.existsSync(cwdConfig)) {
    return cwdConfig;
  }

  const homeConfig = getGlobalConfigPath();
  if (fs.existsSync(homeConfig)) {
    return homeConfig;
  }

  return null;
}

function validateServerConfigs(config: MuxedConfig): void {
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

export function loadConfig(configPath?: string): MuxedConfig {
  const filePath = findConfigFile(configPath);

  const config: MuxedConfig = filePath ? parseConfigFile(filePath) : { mcpServers: {} };

  // Merge global config servers when using a project-level config
  const globalConfigPath = getGlobalConfigPath();
  if (
    (!filePath || path.resolve(filePath) !== path.resolve(globalConfigPath)) &&
    fs.existsSync(globalConfigPath)
  ) {
    try {
      const globalRaw = JSON.parse(fs.readFileSync(globalConfigPath, 'utf-8'));
      const globalResult = MuxedConfigSchema.safeParse(globalRaw);
      if (globalResult.success) {
        // Global servers as base, project servers take precedence
        config.mcpServers = {
          ...globalResult.data.mcpServers,
          ...config.mcpServers,
        } as MuxedConfig['mcpServers'];
      }
    } catch {
      // Ignore invalid global config
    }
  }

  // Merge Claude Desktop servers if enabled
  if (config.mergeClaudeConfig) {
    config.mcpServers = mergeClaudeDesktopServers(config.mcpServers) as MuxedConfig['mcpServers'];
  }

  validateServerConfigs(config);

  // Apply daemon defaults
  config.daemon = {
    ...DAEMON_DEFAULTS,
    ...config.daemon,
    http: {
      enabled: false,
      port: 3100,
      host: '127.0.0.1',
      ...config.daemon?.http,
    },
  };

  return config;
}

function parseConfigFile(filePath: string): MuxedConfig {
  const raw = fs.readFileSync(filePath, 'utf-8');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in config file: ${filePath}`);
  }

  const result = MuxedConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid config: ${z.prettifyError(result.error)}`);
  }

  return result.data as MuxedConfig;
}
