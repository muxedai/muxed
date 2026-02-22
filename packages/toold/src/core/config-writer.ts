import fs from 'node:fs';
import path from 'node:path';
import { getMcpdConfigPath } from './agents.js';
import type { McpdConfig, ServerConfig } from './types.js';

export function getConfigPath(scope: 'local' | 'global', explicitPath?: string): string {
  return getMcpdConfigPath(scope, explicitPath);
}

export function readConfigFile(filePath: string): McpdConfig {
  if (!fs.existsSync(filePath)) {
    return { mcpServers: {} };
  }
  try {
    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
    return {
      ...content,
      mcpServers: (content.mcpServers ?? {}) as Record<string, ServerConfig>,
    } as McpdConfig;
  } catch {
    return { mcpServers: {} };
  }
}

export function writeConfigFile(filePath: string, config: McpdConfig): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + '\n');
}

export function addServer(
  filePath: string,
  name: string,
  serverConfig: ServerConfig
): { added: boolean; existed: boolean } {
  const config = readConfigFile(filePath);
  const existed = name in config.mcpServers;
  config.mcpServers[name] = serverConfig;
  writeConfigFile(filePath, config);
  return { added: true, existed };
}

export function removeServer(
  filePath: string,
  name: string
): { removed: boolean; existed: boolean } {
  const config = readConfigFile(filePath);
  const existed = name in config.mcpServers;
  if (!existed) {
    return { removed: false, existed: false };
  }
  delete config.mcpServers[name];
  writeConfigFile(filePath, config);
  return { removed: true, existed: true };
}

export function getServer(filePath: string, name: string): ServerConfig | null {
  const config = readConfigFile(filePath);
  return config.mcpServers[name] ?? null;
}

export function listServers(filePath: string): Record<string, ServerConfig> {
  const config = readConfigFile(filePath);
  return config.mcpServers;
}
