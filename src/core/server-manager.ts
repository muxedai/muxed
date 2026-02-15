import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js';
import type { Tool, Resource, Prompt } from '@modelcontextprotocol/sdk/types.js';
import type {
  ServerConfig,
  ServerConnectionStatus,
  ServerState,
  Implementation,
  ServerCapabilities,
} from './types.js';
import { isStdioConfig, isHttpConfig } from './types.js';
import { getLogger } from '../utils/logger.js';

export type ServerManagerOptions = {
  connectTimeout?: number;
  healthCheckInterval?: number;
  maxRestartAttempts?: number; // -1 = unlimited
};

type HealthCallback = (name: string, status: ServerConnectionStatus, error?: string) => void;

export class ServerManager {
  private client: Client | undefined;
  private transport:
    | StdioClientTransport
    | StreamableHTTPClientTransport
    | SSEClientTransport
    | undefined;
  private status: ServerConnectionStatus = 'closed';
  private error: string | undefined;
  private serverInfo: Implementation | undefined;
  private capabilities: ServerCapabilities | undefined;
  private protocolVersion: string | undefined;
  private instructions: string | undefined;
  private tools: Tool[] = [];
  private resources: Resource[] = [];
  private prompts: Prompt[] = [];

  // Health checking
  private healthTimer: ReturnType<typeof setInterval> | undefined;
  private consecutiveFailures = 0;
  private lastHealthCheck: Date | undefined;

  // Auto-restart
  private restartCount = 0;
  private restartTimer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;

  // Options
  private connectTimeout: number | undefined;
  private healthCheckInterval: number;
  private maxRestartAttempts: number;

  // Callbacks
  private onHealthChange: HealthCallback | undefined;

  constructor(
    readonly name: string,
    private readonly config: ServerConfig,
    options?: ServerManagerOptions
  ) {
    this.connectTimeout = options?.connectTimeout;
    this.healthCheckInterval = options?.healthCheckInterval ?? 30_000;
    this.maxRestartAttempts = options?.maxRestartAttempts ?? -1;
  }

  setHealthCallback(cb: HealthCallback): void {
    this.onHealthChange = cb;
  }

  private emitHealthChange(newStatus: ServerConnectionStatus, error?: string): void {
    if (this.onHealthChange) {
      this.onHealthChange(this.name, newStatus, error);
    }
  }

  async connect(connectTimeout?: number): Promise<void> {
    this.status = 'connecting';
    this.error = undefined;
    const timeout = connectTimeout ?? this.connectTimeout;

    try {
      if (isStdioConfig(this.config)) {
        this.transport = new StdioClientTransport({
          command: this.config.command,
          args: this.config.args,
          env: this.config.env
            ? ({ ...process.env, ...this.config.env } as Record<string, string>)
            : undefined,
          cwd: this.config.cwd,
        });
      } else if (isHttpConfig(this.config) && this.config.transport === 'sse') {
        const opts: ConstructorParameters<typeof SSEClientTransport>[1] = {};
        if (this.config.headers) {
          opts.requestInit = { headers: this.config.headers };
        }
        this.transport = new SSEClientTransport(new URL(this.config.url), opts);
      } else {
        const httpConfig = this.config;
        const opts: ConstructorParameters<typeof StreamableHTTPClientTransport>[1] = {};
        if (httpConfig.headers) {
          opts.requestInit = { headers: httpConfig.headers };
        }
        if (httpConfig.sessionId) {
          opts.sessionId = httpConfig.sessionId;
        }
        if (httpConfig.reconnection) {
          const r = httpConfig.reconnection;
          opts.reconnectionOptions = {
            maxReconnectionDelay: r.maxDelay ?? 30_000,
            initialReconnectionDelay: r.initialDelay ?? 1_000,
            reconnectionDelayGrowFactor: r.growFactor ?? 1.5,
            maxRetries: r.maxRetries ?? 2,
          };
        }
        this.transport = new StreamableHTTPClientTransport(new URL(httpConfig.url), opts);
      }

      this.client = new Client(
        { name: 'mcpd', version: '0.1.0' },
        {
          capabilities: { tasks: { list: {}, cancel: {} } },
          listChanged: {
            tools: {
              autoRefresh: false,
              onChanged: () => {
                this.refreshTools().catch(() => {});
              },
            },
            resources: {
              autoRefresh: false,
              onChanged: () => {
                this.refreshResources().catch(() => {});
              },
            },
            prompts: {
              autoRefresh: false,
              onChanged: () => {
                this.refreshPrompts().catch(() => {});
              },
            },
          },
        }
      );

      this.client.onclose = () => {
        const previousStatus = this.status;
        if (this.status !== 'error') {
          this.status = 'closed';
        }
        // Detect unexpected disconnection and trigger auto-restart
        if (previousStatus === 'connected' && !this.stopped) {
          getLogger().warn('Connection closed unexpectedly, will attempt restart', this.name);
          this.emitHealthChange('closed');
          this.scheduleRestart();
        }
      };

      const requestOptions = timeout ? { signal: AbortSignal.timeout(timeout) } : undefined;
      await this.client.connect(this.transport, requestOptions);

      this.capabilities = this.client.getServerCapabilities();
      this.serverInfo = this.client.getServerVersion();
      this.instructions = this.client.getInstructions();
      this.protocolVersion =
        (this.transport instanceof StreamableHTTPClientTransport
          ? this.transport.protocolVersion
          : undefined) ?? LATEST_PROTOCOL_VERSION;
      this.status = 'connected';
      this.consecutiveFailures = 0;

      await this.refreshTools();
      await this.refreshResources();
      await this.refreshPrompts();

      this.startHealthChecks();
      this.emitHealthChange('connected');
      getLogger().info('Connected successfully', this.name);
    } catch (err) {
      this.status = 'error';
      this.error = err instanceof Error ? err.message : String(err);
      this.emitHealthChange('error', this.error);
      getLogger().error(`Connection failed: ${this.error}`, this.name);
    }
  }

  async disconnect(): Promise<void> {
    this.stopped = true;
    this.stopHealthChecks();
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = undefined;
    }
    if (this.client) {
      await this.client.close();
    }
    this.status = 'closed';
  }

  // --- Health checking ---

  private startHealthChecks(): void {
    this.stopHealthChecks();
    if (this.healthCheckInterval <= 0) return;

    this.healthTimer = setInterval(() => {
      this.performHealthCheck().catch(() => {});
    }, this.healthCheckInterval);
  }

  private stopHealthChecks(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = undefined;
    }
  }

  private async performHealthCheck(): Promise<void> {
    if (!this.client || this.status !== 'connected') return;

    this.lastHealthCheck = new Date();
    try {
      await this.client.ping();
      if (this.consecutiveFailures > 0) {
        getLogger().info(
          `Health check recovered after ${this.consecutiveFailures} failures`,
          this.name
        );
      }
      this.consecutiveFailures = 0;
    } catch (err) {
      this.consecutiveFailures++;
      const msg = err instanceof Error ? err.message : String(err);
      getLogger().warn(
        `Health check failed (${this.consecutiveFailures} consecutive): ${msg}`,
        this.name
      );

      if (this.consecutiveFailures >= 3) {
        this.status = 'error';
        this.error = `Health check failed ${this.consecutiveFailures} times`;
        this.emitHealthChange('error', this.error);
        getLogger().error(
          `Marked as error after ${this.consecutiveFailures} failed pings`,
          this.name
        );
        this.stopHealthChecks();
        this.scheduleRestart();
      }
    }
  }

  // --- Auto-restart ---

  private scheduleRestart(): void {
    if (this.stopped) return;
    if (this.maxRestartAttempts >= 0 && this.restartCount >= this.maxRestartAttempts) {
      getLogger().error(
        `Max restart attempts (${this.maxRestartAttempts}) reached, giving up`,
        this.name
      );
      return;
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s, max 60s
    const delay = Math.min(1000 * Math.pow(2, this.restartCount), 60_000);
    this.restartCount++;

    getLogger().info(`Scheduling restart attempt ${this.restartCount} in ${delay}ms`, this.name);

    this.restartTimer = setTimeout(() => {
      this.restartTimer = undefined;
      this.attemptRestart().catch(() => {});
    }, delay);
  }

  private async attemptRestart(): Promise<void> {
    if (this.stopped) return;

    getLogger().info(`Attempting restart (attempt ${this.restartCount})`, this.name);

    // Clean up old client
    if (this.client) {
      try {
        await this.client.close();
      } catch {
        // Ignore close errors during restart
      }
      this.client = undefined;
      this.transport = undefined;
    }

    await this.connect(this.connectTimeout);

    if (this.status === 'connected') {
      getLogger().info(`Restart successful after ${this.restartCount} attempts`, this.name);
      this.restartCount = 0;
    }
    // If connect failed, it will set status to 'error' and the onclose handler won't
    // trigger restart for failed connections, so we schedule manually
    if (this.status === 'error' && !this.stopped) {
      this.scheduleRestart();
    }
  }

  // --- Data access ---

  listTools(): Tool[] {
    return this.tools;
  }

  private async refreshTools(): Promise<void> {
    if (!this.client) return;
    const result = await this.client.listTools();
    this.tools = result.tools;
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    timeout?: number
  ): Promise<Awaited<ReturnType<Client['callTool']>>> {
    if (!this.client) {
      throw new Error(`Server "${this.name}" is not connected`);
    }

    const options = timeout ? { signal: AbortSignal.timeout(timeout) } : undefined;
    return await this.client.callTool({ name, arguments: args }, undefined, options);
  }

  listResources(): Resource[] {
    return this.resources;
  }

  private async refreshResources(): Promise<void> {
    if (!this.client || !this.capabilities?.resources) return;
    const result = await this.client.listResources();
    this.resources = result.resources;
  }

  async readResource(uri: string): Promise<Awaited<ReturnType<Client['readResource']>>> {
    if (!this.client) {
      throw new Error(`Server "${this.name}" is not connected`);
    }
    return await this.client.readResource({ uri });
  }

  listPrompts(): Prompt[] {
    return this.prompts;
  }

  private async refreshPrompts(): Promise<void> {
    if (!this.client || !this.capabilities?.prompts) return;
    const result = await this.client.listPrompts();
    this.prompts = result.prompts;
  }

  async getPrompt(
    name: string,
    args?: Record<string, string>
  ): Promise<Awaited<ReturnType<Client['getPrompt']>>> {
    if (!this.client) {
      throw new Error(`Server "${this.name}" is not connected`);
    }
    return await this.client.getPrompt({ name, arguments: args });
  }

  async complete(
    ref: { type: string; name: string; uri?: string },
    argument: { name: string; value: string }
  ): Promise<Awaited<ReturnType<Client['complete']>>> {
    if (!this.client) {
      throw new Error(`Server "${this.name}" is not connected`);
    }
    if (!this.capabilities?.completions) {
      throw new Error(`Server "${this.name}" does not support completions`);
    }
    return await this.client.complete({ ref: ref as never, argument });
  }

  async listTasks(
    cursor?: string
  ): Promise<Awaited<ReturnType<Client['experimental']['tasks']['listTasks']>>> {
    if (!this.client) {
      throw new Error(`Server "${this.name}" is not connected`);
    }
    if (!this.capabilities?.experimental?.tasks) {
      throw new Error(`Server "${this.name}" does not support tasks`);
    }
    return await this.client.experimental.tasks.listTasks(cursor);
  }

  async getTask(
    taskId: string
  ): Promise<Awaited<ReturnType<Client['experimental']['tasks']['getTask']>>> {
    if (!this.client) {
      throw new Error(`Server "${this.name}" is not connected`);
    }
    return await this.client.experimental.tasks.getTask(taskId);
  }

  async getTaskResult(
    taskId: string
  ): Promise<Awaited<ReturnType<Client['experimental']['tasks']['getTaskResult']>>> {
    if (!this.client) {
      throw new Error(`Server "${this.name}" is not connected`);
    }
    return await this.client.experimental.tasks.getTaskResult(taskId);
  }

  async cancelTask(
    taskId: string
  ): Promise<Awaited<ReturnType<Client['experimental']['tasks']['cancelTask']>>> {
    if (!this.client) {
      throw new Error(`Server "${this.name}" is not connected`);
    }
    return await this.client.experimental.tasks.cancelTask(taskId);
  }

  async callToolWithTask(
    name: string,
    args: Record<string, unknown>
  ): Promise<{ taskId: string; status: string }> {
    if (!this.client) {
      throw new Error(`Server "${this.name}" is not connected`);
    }
    const stream = this.client.experimental.tasks.callToolStream({
      name,
      arguments: args,
    });
    for await (const message of stream) {
      if (message.type === 'taskCreated') {
        return { taskId: message.task.taskId, status: message.task.status };
      }
    }
    throw new Error('No task created');
  }

  getStatus(): ServerConnectionStatus {
    return this.status;
  }

  getState(): ServerState {
    return {
      name: this.name,
      config: this.config,
      status: this.status,
      error: this.error,
      serverInfo: this.serverInfo,
      capabilities: this.capabilities,
      protocolVersion: this.protocolVersion,
      instructions: this.instructions,
      restartCount: this.restartCount,
      lastHealthCheck: this.lastHealthCheck?.toISOString(),
      consecutiveFailures: this.consecutiveFailures,
    };
  }
}
