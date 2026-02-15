import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { McpdConfig, ServerState } from './types.js';
import { ServerManager } from './server-manager.js';

export class ServerPool {
  private servers = new Map<string, ServerManager>();

  async connectAll(config: McpdConfig): Promise<void> {
    const entries = Object.entries(config.mcpServers);
    for (const [name, serverConfig] of entries) {
      this.servers.set(name, new ServerManager(name, serverConfig));
    }

    const results = await Promise.allSettled(
      [...this.servers.values()].map((manager) => manager.connect(config.daemon?.connectTimeout))
    );

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const result = results[i];
      if (entry && result && result.status === 'rejected') {
        console.error(`Server "${entry[0]}" failed to connect:`, result.reason);
      }
    }
  }

  async disconnectAll(): Promise<void> {
    await Promise.allSettled([...this.servers.values()].map((manager) => manager.disconnect()));
  }

  getServer(name: string): ServerManager | undefined {
    return this.servers.get(name);
  }

  listServers(): ServerState[] {
    return [...this.servers.values()].map((manager) => manager.getState());
  }

  listAllTools(server?: string): Array<{ server: string; tool: Tool }> {
    if (server) {
      const manager = this.servers.get(server);
      if (!manager) return [];
      return manager.listTools().map((tool) => ({ server, tool }));
    }

    const result: Array<{ server: string; tool: Tool }> = [];
    for (const [name, manager] of this.servers) {
      if (manager.getStatus() !== 'connected') continue;
      for (const tool of manager.listTools()) {
        result.push({ server: name, tool });
      }
    }
    return result;
  }

  findTool(serverTool: string): { manager: ServerManager; tool: Tool } | undefined {
    const slashIndex = serverTool.indexOf('/');
    if (slashIndex === -1) return undefined;

    const serverName = serverTool.slice(0, slashIndex);
    const toolName = serverTool.slice(slashIndex + 1);

    const manager = this.servers.get(serverName);
    if (!manager) return undefined;

    const tool = manager.listTools().find((t) => t.name === toolName);
    if (!tool) return undefined;

    return { manager, tool };
  }
}
