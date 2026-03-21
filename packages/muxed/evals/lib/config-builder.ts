import fs from 'node:fs';
import path from 'node:path';
import type { Condition, RunningServer } from '../types.ts';

/**
 * Build an MCP config for the baseline condition.
 * Each server is listed as a direct HTTP connection.
 */
export function buildBaselineConfig(
  servers: RunningServer[],
  dockerHost = 'host.docker.internal'
): Record<string, unknown> {
  const mcpServers: Record<string, unknown> = {};

  for (const server of servers) {
    mcpServers[server.name] = {
      url: `http://${dockerHost}:${server.port}/mcp`,
      transport: 'streamable-http',
    };
  }

  return { mcpServers };
}

/**
 * Build MCP configs for the muxed condition.
 * Returns both the agent MCP config (single muxed entry)
 * and the muxed.config.json (listing all HTTP servers).
 */
export function buildMuxedConfig(
  servers: RunningServer[],
  dockerHost = 'host.docker.internal'
): {
  agentMcpConfig: Record<string, unknown>;
  muxedConfig: Record<string, unknown>;
} {
  const mcpServers: Record<string, unknown> = {};

  for (const server of servers) {
    mcpServers[server.name] = {
      url: `http://${dockerHost}:${server.port}/mcp`,
      transport: 'streamable-http',
    };
  }

  return {
    agentMcpConfig: {
      mcpServers: {
        muxed: {
          command: 'npx',
          args: ['muxed', 'mcp'],
        },
      },
    },
    muxedConfig: {
      mcpServers,
    },
  };
}

/**
 * Write MCP config files to a directory and return the path to the agent's MCP config.
 */
export function writeConfigFiles(
  workDir: string,
  condition: Condition,
  servers: RunningServer[],
  dockerHost = 'host.docker.internal'
): string {
  const mcpConfigPath = path.join(workDir, '.mcp.json');

  if (condition === 'baseline') {
    const config = buildBaselineConfig(servers, dockerHost);
    fs.writeFileSync(mcpConfigPath, JSON.stringify(config, null, 2));
  } else {
    const { agentMcpConfig, muxedConfig } = buildMuxedConfig(servers, dockerHost);
    fs.writeFileSync(mcpConfigPath, JSON.stringify(agentMcpConfig, null, 2));
    fs.writeFileSync(path.join(workDir, 'muxed.config.json'), JSON.stringify(muxedConfig, null, 2));
  }

  return mcpConfigPath;
}
