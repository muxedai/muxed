/// <reference path="../../muxed.generated.d.ts" />

import type {
  Tool,
  Resource,
  Prompt,
  ReadResourceResult,
  GetPromptResult,
  CompleteResult,
} from '@modelcontextprotocol/sdk/types.js';
import type {
  ServerState,
  ServerConfig,
  StdioServerConfig,
  HttpServerConfig,
  DaemonConfig,
} from '../core/types.js';
import { ensureDaemon, sendRequest, MuxedError } from './socket.js';

// Re-export types for library consumers
export type { Tool, Resource, Prompt } from '@modelcontextprotocol/sdk/types.js';
export type {
  ServerState,
  ServerConfig,
  StdioServerConfig,
  HttpServerConfig,
  DaemonConfig,
} from '../core/types.js';
export { MuxedError } from './socket.js';

/** Tool type map – empty by default, populated by `muxed typegen`. */
export interface MuxedToolMap {}

type HasTools = keyof MuxedToolMap extends never ? false : true;

// --- Client-specific types ---

export type CreateClientOptions = {
  /** Path to muxed.config.json. Uses default resolution if omitted. */
  configPath?: string;
  /** Skip auto-starting the daemon. Throws if daemon is not running. Default: true. */
  autoStart?: boolean;
};

export type CallOptions = {
  /** Request timeout in milliseconds. */
  timeout?: number;
  /** Dot-notation field paths to extract from the response. */
  fields?: string[];
};

export type CallResult = {
  content: Array<{
    type: string;
    text?: string;
    mimeType?: string;
    data?: string;
    name?: string;
    uri?: string;
    resource?: { text?: string; blob?: string; mimeType?: string };
  }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

export type TaskHandle = {
  taskId: string;
  server: string;
  status: string;
};

export type DaemonStatus = {
  pid: number;
  uptime: number;
  serverCount: number;
  servers: ServerState[];
};

export type ReloadResult = {
  added: string[];
  removed: string[];
  changed: string[];
};

export type ValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  /** True when the tool's schema uses features not supported by dry-run validation. */
  unsupported?: boolean;
  tool?: {
    name: string;
    annotations?: Record<string, unknown>;
  };
};

export type TaskStatus = Record<string, unknown>;
export type TaskResult = Record<string, unknown>;
export type TaskCancelResult = Record<string, unknown>;

// --- MuxedClient ---

export class MuxedClient {
  #send: (method: string, params?: Record<string, unknown>) => Promise<unknown>;

  /** @internal Use `createClient()` instead. */
  constructor(send: (method: string, params?: Record<string, unknown>) => Promise<unknown>) {
    this.#send = send;
  }

  // --- Servers ---

  async servers(): Promise<ServerState[]> {
    return (await this.#send('servers/list')) as ServerState[];
  }

  // --- Tools ---

  async tools(server?: string): Promise<Array<{ server: string; tool: Tool }>> {
    return (await this.#send('tools/list', server ? { server } : undefined)) as Array<{
      server: string;
      tool: Tool;
    }>;
  }

  async tool(name: string): Promise<Tool> {
    return (await this.#send('tools/info', { name })) as Tool;
  }

  async grep(pattern: string): Promise<Array<{ server: string; tool: Tool }>> {
    return (await this.#send('tools/grep', { pattern })) as Array<{
      server: string;
      tool: Tool;
    }>;
  }

  async call<K extends string>(
    name: HasTools extends true ? (K extends keyof MuxedToolMap ? K : K & {}) : string,
    args?: K extends keyof MuxedToolMap ? MuxedToolMap[K]['input'] : Record<string, unknown>,
    options?: CallOptions
  ): Promise<K extends keyof MuxedToolMap ? MuxedToolMap[K]['output'] : CallResult> {
    return (await this.#send('tools/call', {
      name,
      arguments: args ?? {},
      ...(options?.timeout ? { timeout: options.timeout } : {}),
      ...(options?.fields ? { fields: options.fields } : {}),
    })) as K extends keyof MuxedToolMap ? MuxedToolMap[K]['output'] : CallResult;
  }

  async validate(name: string, args?: Record<string, unknown>): Promise<ValidationResult> {
    return (await this.#send('tools/validate', {
      name,
      arguments: args ?? {},
    })) as ValidationResult;
  }

  async callAsync(name: string, args?: Record<string, unknown>): Promise<TaskHandle> {
    return (await this.#send('tools/call-async', {
      name,
      arguments: args ?? {},
    })) as TaskHandle;
  }

  // --- Resources ---

  async resources(server?: string): Promise<Array<{ server: string; resource: Resource }>> {
    return (await this.#send('resources/list', server ? { server } : undefined)) as Array<{
      server: string;
      resource: Resource;
    }>;
  }

  async read(server: string, uri: string): Promise<ReadResourceResult> {
    return (await this.#send('resources/read', { server, uri })) as ReadResourceResult;
  }

  // --- Prompts ---

  async prompts(server?: string): Promise<Array<{ server: string; prompt: Prompt }>> {
    return (await this.#send('prompts/list', server ? { server } : undefined)) as Array<{
      server: string;
      prompt: Prompt;
    }>;
  }

  async prompt(
    server: string,
    name: string,
    args?: Record<string, string>
  ): Promise<GetPromptResult> {
    return (await this.#send('prompts/get', {
      server,
      name,
      ...(args ? { arguments: args } : {}),
    })) as GetPromptResult;
  }

  // --- Completions ---

  async complete(
    server: string,
    ref: { type: string; name: string; uri?: string },
    argument: { name: string; value: string }
  ): Promise<CompleteResult> {
    return (await this.#send('completions/complete', {
      server,
      ref,
      argument,
    })) as CompleteResult;
  }

  // --- Tasks ---

  async tasks(
    server?: string
  ): Promise<Array<{ server: string; tasks: Array<Record<string, unknown>> }>> {
    return (await this.#send('tasks/list', server ? { server } : undefined)) as Array<{
      server: string;
      tasks: Array<Record<string, unknown>>;
    }>;
  }

  async task(server: string, taskId: string): Promise<TaskStatus> {
    return (await this.#send('tasks/get', { server, taskId })) as TaskStatus;
  }

  async taskResult(server: string, taskId: string): Promise<TaskResult> {
    return (await this.#send('tasks/result', { server, taskId })) as TaskResult;
  }

  async taskCancel(server: string, taskId: string): Promise<TaskCancelResult> {
    return (await this.#send('tasks/cancel', { server, taskId })) as TaskCancelResult;
  }

  // --- Daemon ---

  async status(): Promise<DaemonStatus> {
    return (await this.#send('daemon/status')) as DaemonStatus;
  }

  async reload(configPath?: string): Promise<ReloadResult> {
    return (await this.#send(
      'config/reload',
      configPath ? { configPath } : undefined
    )) as ReloadResult;
  }

  async stop(): Promise<void> {
    await this.#send('daemon/stop');
  }

  // --- Lifecycle ---

  close(): void {
    // The client uses one-shot socket connections per request,
    // so close is a no-op. Provided for API symmetry and future use.
  }
}

// --- Factory ---

export async function createClient(options?: CreateClientOptions): Promise<MuxedClient> {
  const { configPath, autoStart = true } = options ?? {};

  if (autoStart) {
    await ensureDaemon(configPath);
  }

  return new MuxedClient(sendRequest);
}
