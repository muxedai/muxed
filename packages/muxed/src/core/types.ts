import type {
  Tool,
  Resource,
  Prompt,
  Implementation,
  ServerCapabilities,
} from '@modelcontextprotocol/sdk/types.js';

// Re-export SDK types for convenience
export type { Tool, Resource, Prompt, Implementation, ServerCapabilities };

// Server configuration variants
export type StdioServerConfig = {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
};

export type ClientCredentialsAuth = {
  type: 'client_credentials';
  clientId: string;
  clientSecret: string;
  scope?: string;
};

export type AuthorizationCodeAuth = {
  type: 'authorization_code';
  clientId?: string;
  clientSecret?: string;
  scope?: string;
  callbackPort?: number;
};

export type OAuthConfig = ClientCredentialsAuth | AuthorizationCodeAuth;

export type HttpServerConfig = {
  url: string;
  transport?: 'streamable-http' | 'sse';
  headers?: Record<string, string>;
  sessionId?: string;
  reconnection?: {
    maxDelay?: number;
    initialDelay?: number;
    growFactor?: number;
    maxRetries?: number;
  };
  auth?: OAuthConfig;
};

export type ServerConfig = StdioServerConfig | HttpServerConfig;

// Daemon configuration
export type DaemonConfig = {
  idleTimeout?: number; // default: 300000 (5 min)
  connectTimeout?: number; // default: 30000 (30s)
  requestTimeout?: number; // default: 60000 (60s)
  healthCheckInterval?: number; // default: 30000 (30s)
  maxRestartAttempts?: number; // default: -1 (unlimited)
  maxTotalTimeout?: number; // default: 300000 (5 min)
  taskExpiryTimeout?: number; // default: 3600000 (1 hour)
  logLevel?: 'debug' | 'info' | 'warn' | 'error'; // default: 'info'
  shutdownTimeout?: number; // default: 10000 (10s)
  http?: {
    enabled?: boolean;
    port?: number;
    host?: string;
  };
};

// Top-level config
export type MuxedConfig = {
  mcpServers: Record<string, ServerConfig>;
  daemon?: DaemonConfig;
  mergeClaudeConfig?: boolean;
};

// Runtime server status
export type ServerConnectionStatus = 'connecting' | 'connected' | 'error' | 'closed';

// Full server info stored after handshake
export type ServerState = {
  name: string;
  config: ServerConfig;
  status: ServerConnectionStatus;
  error?: string;
  serverInfo?: Implementation;
  capabilities?: ServerCapabilities;
  protocolVersion?: string;
  instructions?: string;
  restartCount?: number;
  lastHealthCheck?: string;
  consecutiveFailures?: number;
};

// Tracked task entry for cleanup
export type TrackedTask = {
  taskId: string;
  server: string;
  status: 'active' | 'unreachable';
  createdAt: number;
};

// Type guards to distinguish config types
export function isStdioConfig(config: ServerConfig): config is StdioServerConfig {
  return 'command' in config;
}

export function isHttpConfig(config: ServerConfig): config is HttpServerConfig {
  return 'url' in config;
}
