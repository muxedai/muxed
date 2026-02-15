import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
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
import { isStdioConfig } from './types.js';

export class ServerManager {
  private client: Client | undefined;
  private transport: StdioClientTransport | StreamableHTTPClientTransport | undefined;
  private status: ServerConnectionStatus = 'closed';
  private error: string | undefined;
  private serverInfo: Implementation | undefined;
  private capabilities: ServerCapabilities | undefined;
  private protocolVersion: string | undefined;
  private instructions: string | undefined;
  private tools: Tool[] = [];
  private resources: Resource[] = [];
  private prompts: Prompt[] = [];

  constructor(
    readonly name: string,
    private readonly config: ServerConfig
  ) {}

  async connect(connectTimeout?: number): Promise<void> {
    this.status = 'connecting';
    this.error = undefined;

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
      } else {
        const opts: ConstructorParameters<typeof StreamableHTTPClientTransport>[1] = {};
        if (this.config.headers) {
          opts.requestInit = { headers: this.config.headers };
        }
        this.transport = new StreamableHTTPClientTransport(new URL(this.config.url), opts);
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
        if (this.status !== 'error') {
          this.status = 'closed';
        }
      };

      const requestOptions = connectTimeout
        ? { signal: AbortSignal.timeout(connectTimeout) }
        : undefined;
      await this.client.connect(this.transport, requestOptions);

      this.capabilities = this.client.getServerCapabilities();
      this.serverInfo = this.client.getServerVersion();
      this.instructions = this.client.getInstructions();
      this.protocolVersion = LATEST_PROTOCOL_VERSION;
      this.status = 'connected';

      await this.refreshTools();
      await this.refreshResources();
      await this.refreshPrompts();
    } catch (err) {
      this.status = 'error';
      this.error = err instanceof Error ? err.message : String(err);
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
    }
    this.status = 'closed';
  }

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
    };
  }
}
