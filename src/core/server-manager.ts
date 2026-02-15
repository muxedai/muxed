import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
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
