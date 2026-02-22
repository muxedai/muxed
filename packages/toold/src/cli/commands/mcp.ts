import { Command } from 'commander';
import {
  getConfigPath,
  readConfigFile,
  addServer,
  removeServer,
  getServer,
  listServers,
} from '../../core/config-writer.js';
import {
  discoverAgentConfigs,
  mergeServers,
  writeTooldConfig,
  getTooldConfigPath,
} from '../../core/agents.js';
import type {
  ServerConfig,
  StdioServerConfig,
  HttpServerConfig,
  OAuthConfig,
} from '../../core/types.js';
import { isStdioConfig, isHttpConfig } from '../../core/types.js';
import { formatJson, formatMcpServer, formatMcpServerList } from '../formatter.js';
import { isDaemonRunning } from '../../daemon/process.js';
import { sendRequest } from '../client.js';
import { startMcpProxy } from '../../mcp-proxy.js';
import * as readline from 'node:readline/promises';
import fs from 'node:fs';

type Scope = 'local' | 'global';

function collectValues(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function getExplicitConfig(cmd: Command): string | undefined {
  // Walk up: mcp -> program
  return cmd.parent?.parent?.opts().config as string | undefined;
}

function parseEnvArgs(envArgs: string[]): Record<string, string> {
  const env: Record<string, string> = {};
  for (const entry of envArgs) {
    const eqIndex = entry.indexOf('=');
    if (eqIndex === -1) {
      throw new Error(`Invalid env format: "${entry}". Expected KEY=value`);
    }
    env[entry.slice(0, eqIndex)] = entry.slice(eqIndex + 1);
  }
  return env;
}

function parseHeaderArgs(headerArgs: string[]): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const entry of headerArgs) {
    const colonIndex = entry.indexOf(':');
    if (colonIndex === -1) {
      throw new Error(`Invalid header format: "${entry}". Expected Key: value`);
    }
    headers[entry.slice(0, colonIndex).trim()] = entry.slice(colonIndex + 1).trim();
  }
  return headers;
}

function resolveTransport(
  commandOrUrl: string,
  transport?: string
): 'stdio' | 'sse' | 'streamable-http' {
  if (transport === 'http') return 'streamable-http';
  if (transport === 'sse') return 'sse';
  if (transport === 'stdio') return 'stdio';
  // Auto-detect
  try {
    new URL(commandOrUrl);
    return 'streamable-http';
  } catch {
    return 'stdio';
  }
}

function buildAuthConfig(opts: {
  clientId?: string;
  clientSecret?: boolean;
  callbackPort?: string;
  oauthScope?: string;
  resolvedSecret?: string;
}): OAuthConfig | undefined {
  if (!opts.clientId && !opts.clientSecret) return undefined;

  if (opts.clientId && opts.resolvedSecret) {
    // client_credentials flow
    const auth: OAuthConfig = {
      type: 'client_credentials',
      clientId: opts.clientId,
      clientSecret: opts.resolvedSecret,
    };
    if (opts.oauthScope) auth.scope = opts.oauthScope;
    return auth;
  }

  // authorization_code flow
  const auth: OAuthConfig = {
    type: 'authorization_code',
  };
  if (opts.clientId) auth.clientId = opts.clientId;
  if (opts.resolvedSecret) auth.clientSecret = opts.resolvedSecret;
  if (opts.oauthScope) auth.scope = opts.oauthScope;
  if (opts.callbackPort) auth.callbackPort = parseInt(opts.callbackPort, 10);
  return auth;
}

function buildServerConfig(
  commandOrUrl: string,
  args: string[],
  opts: {
    env?: string[];
    header?: string[];
    transport?: string;
    clientId?: string;
    clientSecret?: boolean;
    callbackPort?: string;
    oauthScope?: string;
    resolvedSecret?: string;
  }
): ServerConfig {
  const transportType = resolveTransport(commandOrUrl, opts.transport);

  if (transportType === 'stdio') {
    const config: StdioServerConfig = { command: commandOrUrl };
    if (args.length > 0) config.args = args;
    if (opts.env && opts.env.length > 0) config.env = parseEnvArgs(opts.env);
    return config;
  }

  // HTTP-based transport
  const config: HttpServerConfig = { url: commandOrUrl };
  if (transportType === 'sse') config.transport = 'sse';
  // streamable-http is the default, no need to set transport explicitly
  if (opts.header && opts.header.length > 0) config.headers = parseHeaderArgs(opts.header);

  const auth = buildAuthConfig(opts);
  if (auth) config.auth = auth;

  return config;
}

async function getClientSecret(): Promise<string> {
  const envSecret = process.env.MCP_CLIENT_SECRET;
  if (envSecret) return envSecret;

  if (!process.stdin.isTTY) {
    throw new Error(
      'OAuth client secret required. Set MCP_CLIENT_SECRET env var or use an interactive terminal.'
    );
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const secret = await rl.question('Enter OAuth client secret: ');
    if (!secret.trim()) {
      throw new Error('Client secret cannot be empty');
    }
    return secret.trim();
  } finally {
    rl.close();
  }
}

async function tryReloadDaemon(): Promise<void> {
  try {
    const running = await isDaemonRunning();
    if (!running) return;
    await sendRequest('config/reload', {});
  } catch {
    // Best-effort: daemon may not be running
  }
}

// ─── mcp command group ───

export const mcpCommand = new Command('mcp')
  .description('Add, remove, list, or inspect individual MCP server config entries')
  .enablePositionalOptions()
  .action(async (_opts: unknown, cmd: Command) => {
    // When called without a subcommand, start the MCP proxy server over stdio
    const explicitConfig = cmd.parent?.opts().config as string | undefined;
    await startMcpProxy(explicitConfig);
  });

// ─── mcp add ───

mcpCommand
  .command('add')
  .description('Add an MCP server')
  .passThroughOptions()
  .argument('<name>', 'Server name')
  .argument('<commandOrUrl>', 'Command to run or URL to connect to')
  .argument('[args...]', 'Additional arguments (for stdio servers)')
  .option('-e, --env <env>', 'Set environment variables (KEY=value), repeatable', collectValues, [])
  .option('-H, --header <header>', 'Set HTTP headers (Key: value), repeatable', collectValues, [])
  .option('-s, --scope <scope>', 'Config scope: local, global', 'local')
  .option('-t, --transport <transport>', 'Transport: stdio, sse, http')
  .option('--client-id <clientId>', 'OAuth client ID')
  .option('--client-secret', 'Prompt for OAuth client secret (or use MCP_CLIENT_SECRET env)')
  .option('--callback-port <port>', 'Fixed port for OAuth callback')
  .option('--oauth-scope <oauthScope>', 'OAuth scope string')
  .action(
    async (
      name: string,
      commandOrUrl: string,
      args: string[],
      opts: {
        env?: string[];
        header?: string[];
        scope: string;
        transport?: string;
        clientId?: string;
        clientSecret?: boolean;
        callbackPort?: string;
        oauthScope?: string;
      }
    ) => {
      const explicitConfig = getExplicitConfig(mcpCommand);
      const scope = opts.scope as Scope;
      const configPath = getConfigPath(scope, explicitConfig);

      let resolvedSecret: string | undefined;
      if (opts.clientSecret) {
        resolvedSecret = await getClientSecret();
      }

      const serverConfig = buildServerConfig(commandOrUrl, args, {
        ...opts,
        resolvedSecret,
      });

      const result = addServer(configPath, name, serverConfig);
      await tryReloadDaemon();

      if (result.existed) {
        console.log(`Updated "${name}" in ${scope} config (${configPath})`);
      } else {
        console.log(`Added "${name}" to ${scope} config (${configPath})`);
      }
    }
  );

// ─── mcp add-json ───

mcpCommand
  .command('add-json')
  .description('Add an MCP server from a JSON config string')
  .argument('<name>', 'Server name')
  .argument('<json>', 'JSON server configuration')
  .option('-s, --scope <scope>', 'Config scope: local, global', 'local')
  .action(async (name: string, jsonStr: string, opts: { scope: string }) => {
    const explicitConfig = getExplicitConfig(mcpCommand);
    const scope = opts.scope as Scope;
    const configPath = getConfigPath(scope, explicitConfig);

    let serverConfig: ServerConfig;
    try {
      serverConfig = JSON.parse(jsonStr) as ServerConfig;
    } catch {
      console.error('Error: Invalid JSON');
      process.exitCode = 1;
      return;
    }

    if (!('command' in serverConfig) && !('url' in serverConfig)) {
      console.error('Error: JSON must contain either "command" (stdio) or "url" (http) field');
      process.exitCode = 1;
      return;
    }

    const result = addServer(configPath, name, serverConfig);
    await tryReloadDaemon();

    if (result.existed) {
      console.log(`Updated "${name}" in ${scope} config (${configPath})`);
    } else {
      console.log(`Added "${name}" to ${scope} config (${configPath})`);
    }
  });

// ─── mcp add-from-claude-desktop ───

mcpCommand
  .command('add-from-claude-desktop')
  .description('Import MCP servers from Claude Desktop config')
  .option('-s, --scope <scope>', 'Config scope: local, global', 'local')
  .action(async (opts: { scope: string }) => {
    const explicitConfig = getExplicitConfig(mcpCommand);
    const scope = opts.scope as Scope;
    const configPath = getConfigPath(scope, explicitConfig);

    const { discovered, warnings } = discoverAgentConfigs();
    const claudeDesktop = discovered.filter((d) => d.agent.name === 'claude-desktop');

    if (claudeDesktop.length === 0) {
      console.log('No Claude Desktop configuration found.');
      return;
    }

    // Read existing toold servers
    let existingServers: Record<string, ServerConfig> = {};
    if (fs.existsSync(configPath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<
          string,
          unknown
        >;
        existingServers = (existing.mcpServers ?? {}) as Record<string, ServerConfig>;
      } catch {
        // Start fresh
      }
    }

    const result = mergeServers(claudeDesktop, existingServers);

    // Add all merged servers (no conflict resolution for this simple command)
    const allServers = { ...result.merged };
    writeTooldConfig(configPath, allServers);
    await tryReloadDaemon();

    for (const w of warnings) {
      console.error(`Warning: ${w}`);
    }

    if (result.imported.length > 0) {
      console.log(
        `Imported ${result.imported.length} server(s) from Claude Desktop: ${result.imported.join(', ')}`
      );
    }
    if (result.skipped.length > 0) {
      console.log(
        `Skipped ${result.skipped.length} (already existed): ${result.skipped.join(', ')}`
      );
    }
    if (result.imported.length === 0 && result.skipped.length === 0) {
      console.log('No servers found in Claude Desktop config.');
    }
  });

// ─── mcp get ───

mcpCommand
  .command('get')
  .description('Get details of a configured MCP server')
  .argument('<name>', 'Server name')
  .option('--json', 'Output as JSON')
  .action(async (name: string, opts: { json?: boolean }) => {
    const explicitConfig = getExplicitConfig(mcpCommand);

    // Check local first, then global
    const localPath = getConfigPath('local', explicitConfig);
    const globalPath = getConfigPath('global', explicitConfig);

    const localServer = getServer(localPath, name);
    const globalServer = getServer(globalPath, name);

    const server = localServer ?? globalServer;
    const scope: Scope = localServer ? 'local' : 'global';

    if (!server) {
      console.error(`Server "${name}" not found in local or global config.`);
      process.exitCode = 1;
      return;
    }

    if (opts.json) {
      console.log(formatJson({ name, scope, config: server }));
    } else {
      console.log(formatMcpServer(name, server, scope));
    }
  });

// ─── mcp list ───

mcpCommand
  .command('list')
  .description('List all configured MCP servers')
  .option('--json', 'Output as JSON')
  .action(async (opts: { json?: boolean }) => {
    const explicitConfig = getExplicitConfig(mcpCommand);
    const localPath = getConfigPath('local', explicitConfig);
    const globalPath = getConfigPath('global', explicitConfig);

    const localServers = listServers(localPath);
    const globalServers = listServers(globalPath);

    const entries: Array<{ name: string; config: ServerConfig; scope: Scope }> = [];

    for (const [name, config] of Object.entries(localServers)) {
      entries.push({ name, config, scope: 'local' });
    }
    for (const [name, config] of Object.entries(globalServers)) {
      // Skip if already in local (local takes precedence)
      if (name in localServers) continue;
      entries.push({ name, config, scope: 'global' });
    }

    if (opts.json) {
      console.log(formatJson(entries));
    } else {
      console.log(formatMcpServerList(entries));
    }
  });

// ─── mcp remove ───

mcpCommand
  .command('remove')
  .description('Remove an MCP server')
  .argument('<name>', 'Server name')
  .option('-s, --scope <scope>', 'Config scope: local, global (searches both if not specified)')
  .action(async (name: string, opts: { scope?: string }) => {
    const explicitConfig = getExplicitConfig(mcpCommand);

    if (opts.scope) {
      const scope = opts.scope as Scope;
      const configPath = getConfigPath(scope, explicitConfig);
      const result = removeServer(configPath, name);
      if (result.removed) {
        await tryReloadDaemon();
        console.log(`Removed "${name}" from ${scope} config (${configPath})`);
      } else {
        console.error(`Server "${name}" not found in ${scope} config.`);
        process.exitCode = 1;
      }
      return;
    }

    // No scope specified: search local first, then global
    const localPath = getConfigPath('local', explicitConfig);
    const localResult = removeServer(localPath, name);
    if (localResult.removed) {
      await tryReloadDaemon();
      console.log(`Removed "${name}" from local config (${localPath})`);
      return;
    }

    const globalPath = getConfigPath('global', explicitConfig);
    const globalResult = removeServer(globalPath, name);
    if (globalResult.removed) {
      await tryReloadDaemon();
      console.log(`Removed "${name}" from global config (${globalPath})`);
      return;
    }

    console.error(`Server "${name}" not found in local or global config.`);
    process.exitCode = 1;
  });
