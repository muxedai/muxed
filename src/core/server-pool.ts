import type { Tool, Resource, Prompt } from '@modelcontextprotocol/sdk/types.js';
import type { McpdConfig, ServerState, TrackedTask } from './types.js';
import { ServerManager } from './server-manager.js';
import { getLogger } from '../utils/logger.js';

export class ServerPool {
  private servers = new Map<string, ServerManager>();
  private trackedTasks = new Map<string, TrackedTask>();
  private taskExpiryTimer: ReturnType<typeof setInterval> | undefined;
  private taskExpiryTimeout: number = 3_600_000;

  async connectAll(config: McpdConfig): Promise<void> {
    const entries = Object.entries(config.mcpServers);
    this.taskExpiryTimeout = config.daemon?.taskExpiryTimeout ?? 3_600_000;

    for (const [name, serverConfig] of entries) {
      const manager = new ServerManager(name, serverConfig, {
        connectTimeout: config.daemon?.connectTimeout,
        healthCheckInterval: config.daemon?.healthCheckInterval,
        maxRestartAttempts: config.daemon?.maxRestartAttempts,
      });
      manager.setHealthCallback((serverName, status, error) => {
        this.onServerHealthChange(serverName, status, error);
      });
      this.servers.set(name, manager);
    }

    const results = await Promise.allSettled(
      [...this.servers.values()].map((manager) => manager.connect(config.daemon?.connectTimeout))
    );

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const result = results[i];
      if (entry && result && result.status === 'rejected') {
        getLogger().error(`Server "${entry[0]}" failed to connect: ${result.reason}`, entry[0]);
      }
    }

    this.startTaskExpiry();
  }

  async disconnectAll(): Promise<void> {
    this.stopTaskExpiry();
    await Promise.allSettled([...this.servers.values()].map((manager) => manager.disconnect()));
  }

  private onServerHealthChange(serverName: string, status: string, error?: string): void {
    if (status === 'closed' || status === 'error') {
      // Mark tasks for this server as unreachable
      for (const [taskId, task] of this.trackedTasks) {
        if (task.server === serverName && task.status === 'active') {
          task.status = 'unreachable';
          getLogger().warn(
            `Task ${taskId} marked as unreachable (server ${serverName} disconnected)`,
            serverName
          );
        }
      }
    } else if (status === 'connected') {
      getLogger().info(`Server reconnected`, serverName);
    }

    if (error) {
      getLogger().error(`Health change: ${status} - ${error}`, serverName);
    }
  }

  // --- Task tracking ---

  trackTask(taskId: string, server: string): void {
    this.trackedTasks.set(taskId, {
      taskId,
      server,
      status: 'active',
      createdAt: Date.now(),
    });
  }

  getTrackedTask(taskId: string): TrackedTask | undefined {
    return this.trackedTasks.get(taskId);
  }

  private startTaskExpiry(): void {
    this.stopTaskExpiry();
    // Check every 5 minutes for stale tasks
    this.taskExpiryTimer = setInterval(() => {
      const now = Date.now();
      for (const [taskId, task] of this.trackedTasks) {
        if (now - task.createdAt > this.taskExpiryTimeout) {
          this.trackedTasks.delete(taskId);
          getLogger().info(`Expired stale task ${taskId}`, task.server);
        }
      }
    }, 300_000);
  }

  private stopTaskExpiry(): void {
    if (this.taskExpiryTimer) {
      clearInterval(this.taskExpiryTimer);
      this.taskExpiryTimer = undefined;
    }
  }

  // --- Server access ---

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

  grepTools(pattern: string): Array<{ server: string; tool: Tool }> {
    const regex = new RegExp(pattern, 'i');
    const result: Array<{ server: string; tool: Tool }> = [];

    for (const [name, manager] of this.servers) {
      if (manager.getStatus() !== 'connected') continue;
      for (const tool of manager.listTools()) {
        if (
          regex.test(tool.name) ||
          (tool.title && regex.test(tool.title)) ||
          (tool.description && regex.test(tool.description))
        ) {
          result.push({ server: name, tool });
        }
      }
    }
    return result;
  }

  listAllResources(server?: string): Array<{ server: string; resource: Resource }> {
    if (server) {
      const manager = this.servers.get(server);
      if (!manager) return [];
      return manager.listResources().map((resource) => ({ server, resource }));
    }

    const result: Array<{ server: string; resource: Resource }> = [];
    for (const [name, manager] of this.servers) {
      if (manager.getStatus() !== 'connected') continue;
      for (const resource of manager.listResources()) {
        result.push({ server: name, resource });
      }
    }
    return result;
  }

  async readResource(
    serverName: string,
    uri: string
  ): Promise<Awaited<ReturnType<ServerManager['readResource']>>> {
    const manager = this.servers.get(serverName);
    if (!manager) {
      throw new Error(`Server not found: ${serverName}`);
    }
    return await manager.readResource(uri);
  }

  listAllPrompts(server?: string): Array<{ server: string; prompt: Prompt }> {
    if (server) {
      const manager = this.servers.get(server);
      if (!manager) return [];
      return manager.listPrompts().map((prompt) => ({ server, prompt }));
    }

    const result: Array<{ server: string; prompt: Prompt }> = [];
    for (const [name, manager] of this.servers) {
      if (manager.getStatus() !== 'connected') continue;
      for (const prompt of manager.listPrompts()) {
        result.push({ server: name, prompt });
      }
    }
    return result;
  }

  async getPrompt(
    serverName: string,
    name: string,
    args?: Record<string, string>
  ): Promise<Awaited<ReturnType<ServerManager['getPrompt']>>> {
    const manager = this.servers.get(serverName);
    if (!manager) {
      throw new Error(`Server not found: ${serverName}`);
    }
    return await manager.getPrompt(name, args);
  }

  async complete(
    serverName: string,
    ref: { type: string; name: string; uri?: string },
    argument: { name: string; value: string }
  ): Promise<Awaited<ReturnType<ServerManager['complete']>>> {
    const manager = this.servers.get(serverName);
    if (!manager) {
      throw new Error(`Server not found: ${serverName}`);
    }
    return await manager.complete(ref, argument);
  }

  async listAllTasks(
    server?: string
  ): Promise<Array<{ server: string; tasks: Array<Record<string, unknown>> }>> {
    const result: Array<{ server: string; tasks: Array<Record<string, unknown>> }> = [];

    const managers = server
      ? [[server, this.servers.get(server)] as const].filter(([, m]) => m)
      : [...this.servers.entries()];

    for (const [name, manager] of managers) {
      if (!manager || manager.getStatus() !== 'connected') continue;
      try {
        const taskResult = await manager.listTasks();
        result.push({
          server: name,
          tasks: taskResult.tasks as unknown as Array<Record<string, unknown>>,
        });
      } catch {
        // Server doesn't support tasks, skip
      }
    }
    return result;
  }

  async getTask(
    serverName: string,
    taskId: string
  ): Promise<Awaited<ReturnType<ServerManager['getTask']>>> {
    // Check if task is tracked and unreachable
    const tracked = this.trackedTasks.get(taskId);
    if (tracked && tracked.status === 'unreachable') {
      throw new Error(`Task ${taskId} is unreachable: server "${tracked.server}" disconnected`);
    }

    const manager = this.servers.get(serverName);
    if (!manager) {
      throw new Error(`Server not found: ${serverName}`);
    }
    return await manager.getTask(taskId);
  }

  async getTaskResult(
    serverName: string,
    taskId: string
  ): Promise<Awaited<ReturnType<ServerManager['getTaskResult']>>> {
    const tracked = this.trackedTasks.get(taskId);
    if (tracked && tracked.status === 'unreachable') {
      throw new Error(`Task ${taskId} is unreachable: server "${tracked.server}" disconnected`);
    }

    const manager = this.servers.get(serverName);
    if (!manager) {
      throw new Error(`Server not found: ${serverName}`);
    }
    return await manager.getTaskResult(taskId);
  }

  async cancelTask(
    serverName: string,
    taskId: string
  ): Promise<Awaited<ReturnType<ServerManager['cancelTask']>>> {
    const tracked = this.trackedTasks.get(taskId);
    if (tracked && tracked.status === 'unreachable') {
      throw new Error(`Task ${taskId} is unreachable: server "${tracked.server}" disconnected`);
    }

    const manager = this.servers.get(serverName);
    if (!manager) {
      throw new Error(`Server not found: ${serverName}`);
    }
    const result = await manager.cancelTask(taskId);
    this.trackedTasks.delete(taskId);
    return result;
  }

  async reload(
    newConfig: McpdConfig
  ): Promise<{ added: string[]; removed: string[]; changed: string[] }> {
    const oldNames = new Set(this.servers.keys());
    const newNames = new Set(Object.keys(newConfig.mcpServers));

    const added: string[] = [];
    const removed: string[] = [];
    const changed: string[] = [];

    // Find removed servers
    for (const name of oldNames) {
      if (!newNames.has(name)) {
        removed.push(name);
        const manager = this.servers.get(name);
        if (manager) {
          await manager.disconnect().catch(() => {});
        }
        this.servers.delete(name);
      }
    }

    // Find added and changed servers
    for (const [name, serverConfig] of Object.entries(newConfig.mcpServers)) {
      if (!oldNames.has(name)) {
        added.push(name);
        const manager = new ServerManager(name, serverConfig, {
          connectTimeout: newConfig.daemon?.connectTimeout,
          healthCheckInterval: newConfig.daemon?.healthCheckInterval,
          maxRestartAttempts: newConfig.daemon?.maxRestartAttempts,
        });
        manager.setHealthCallback((serverName, status, error) => {
          this.onServerHealthChange(serverName, status, error);
        });
        this.servers.set(name, manager);
        await manager.connect(newConfig.daemon?.connectTimeout).catch(() => {});
      } else {
        const oldState = this.servers.get(name)!.getState();
        if (JSON.stringify(oldState.config) !== JSON.stringify(serverConfig)) {
          changed.push(name);
          const oldManager = this.servers.get(name)!;
          await oldManager.disconnect().catch(() => {});
          const newManager = new ServerManager(name, serverConfig, {
            connectTimeout: newConfig.daemon?.connectTimeout,
            healthCheckInterval: newConfig.daemon?.healthCheckInterval,
            maxRestartAttempts: newConfig.daemon?.maxRestartAttempts,
          });
          newManager.setHealthCallback((serverName, status, error) => {
            this.onServerHealthChange(serverName, status, error);
          });
          this.servers.set(name, newManager);
          await newManager.connect(newConfig.daemon?.connectTimeout).catch(() => {});
        }
      }
    }

    return { added, removed, changed };
  }
}
