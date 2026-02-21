import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SseError } from '@modelcontextprotocol/sdk/client/sse.js';
import type { HttpServerConfig } from './types.js';

// ---- Shared mock state ----

let mockClientConnect: Mock;
let mockTransportFinishAuth: Mock;
let mockCallbackServerStart: Mock;
let mockCallbackServerWaitForPort: Mock;
let mockCallbackServerClose: Mock;
let mockAuthProviderSetRedirectUrl: Mock;
let mockTokenStoreHasTokens: Mock;

// ---- Module mocks (use `function` for constructable mocks) ----

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.connect = (...args: unknown[]) => mockClientConnect(...args);
    this.close = vi.fn().mockResolvedValue(undefined);
    this.getServerCapabilities = vi.fn().mockReturnValue({});
    this.getServerVersion = vi.fn().mockReturnValue({ name: 'test', version: '1.0' });
    this.getInstructions = vi.fn().mockReturnValue(undefined);
    this.listTools = vi.fn().mockResolvedValue({ tools: [] });
    this.listResources = vi.fn().mockResolvedValue({ resources: [] });
    this.listPrompts = vi.fn().mockResolvedValue({ prompts: [] });
    this.ping = vi.fn().mockResolvedValue(undefined);
    this.onclose = null;
  }),
}));

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', async (importOriginal) => {
  const orig =
    await importOriginal<typeof import('@modelcontextprotocol/sdk/client/streamableHttp.js')>();
  return {
    StreamableHTTPError: orig.StreamableHTTPError,
    StreamableHTTPClientTransport: vi.fn().mockImplementation(function (
      this: Record<string, unknown>
    ) {
      this.finishAuth = (...args: unknown[]) => mockTransportFinishAuth(...args);
      this.protocolVersion = '2025-11-25';
    }),
  };
});

vi.mock('@modelcontextprotocol/sdk/client/sse.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@modelcontextprotocol/sdk/client/sse.js')>();
  return {
    SseError: orig.SseError,
    SSEClientTransport: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
      this.finishAuth = (...args: unknown[]) => mockTransportFinishAuth(...args);
    }),
  };
});

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn(),
}));

vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
  LATEST_PROTOCOL_VERSION: '2025-11-25',
}));

vi.mock('./oauth/index.js', () => ({
  createAuthProvider: vi.fn(),
  CallbackServer: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.start = (...args: unknown[]) => mockCallbackServerStart(...args);
    this.waitForPort = () => mockCallbackServerWaitForPort();
    this.close = () => mockCallbackServerClose();
  }),
  AuthorizationCodeProvider: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.setRedirectUrl = (...args: unknown[]) => mockAuthProviderSetRedirectUrl(...args);
  }),
  TokenStore: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.hasTokens = () => mockTokenStoreHasTokens();
  }),
}));

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Import after mocks are set up
import { ServerManager } from './server-manager.js';
import { CallbackServer } from './oauth/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

beforeEach(() => {
  vi.clearAllMocks();

  mockClientConnect = vi.fn().mockResolvedValue(undefined);
  mockTransportFinishAuth = vi.fn().mockResolvedValue(undefined);
  mockCallbackServerStart = vi.fn().mockResolvedValue({ code: 'test-auth-code' });
  mockCallbackServerWaitForPort = vi.fn().mockResolvedValue(12345);
  mockCallbackServerClose = vi.fn();
  mockAuthProviderSetRedirectUrl = vi.fn();
  mockTokenStoreHasTokens = vi.fn().mockReturnValue(false);
});

describe('auto-OAuth for HTTP servers', () => {
  it('initiates OAuth flow when HTTP server returns UnauthorizedError without auth config', async () => {
    const config: HttpServerConfig = { url: 'http://example.com/mcp' };
    const manager = new ServerManager('test-auto', config, {
      maxRestartAttempts: 0,
      healthCheckInterval: 0,
    });

    // First connect() call throws UnauthorizedError → triggers auto-detection
    // Inside connectWithOAuth: first connect throws UnauthorizedError → waits for callback
    // After finishAuth: second connect succeeds
    mockClientConnect
      .mockRejectedValueOnce(new UnauthorizedError())
      .mockRejectedValueOnce(new UnauthorizedError())
      .mockResolvedValueOnce(undefined);

    await manager.connect();

    expect(manager.getStatus()).toBe('connected');
    expect(CallbackServer).toHaveBeenCalled();
    expect(mockCallbackServerStart).toHaveBeenCalled();
    expect(mockTransportFinishAuth).toHaveBeenCalledWith('test-auth-code');
    expect(mockCallbackServerClose).toHaveBeenCalled();
  });

  it('initiates OAuth flow when HTTP server returns StreamableHTTPError 401', async () => {
    const config: HttpServerConfig = { url: 'http://example.com/mcp' };
    const manager = new ServerManager('test-http-401', config, {
      maxRestartAttempts: 0,
      healthCheckInterval: 0,
    });

    mockClientConnect
      .mockRejectedValueOnce(new StreamableHTTPError(401, 'Unauthorized'))
      .mockRejectedValueOnce(new UnauthorizedError())
      .mockResolvedValueOnce(undefined);

    await manager.connect();

    expect(manager.getStatus()).toBe('connected');
    expect(CallbackServer).toHaveBeenCalled();
  });

  it('initiates OAuth flow when SSE server returns SseError 401', async () => {
    const config: HttpServerConfig = { url: 'http://example.com/mcp', transport: 'sse' };
    const manager = new ServerManager('test-sse-401', config, {
      maxRestartAttempts: 0,
      healthCheckInterval: 0,
    });

    mockClientConnect
      .mockRejectedValueOnce(
        new SseError(401, 'Unauthorized', { type: 'error' } as unknown as Event)
      )
      .mockRejectedValueOnce(new UnauthorizedError())
      .mockResolvedValueOnce(undefined);

    await manager.connect();

    expect(manager.getStatus()).toBe('connected');
    expect(CallbackServer).toHaveBeenCalled();
  });

  it('does not initiate auto-OAuth for non-401 StreamableHTTPError', async () => {
    const config: HttpServerConfig = { url: 'http://example.com/mcp' };
    const manager = new ServerManager('test-http-500', config, {
      maxRestartAttempts: 0,
      healthCheckInterval: 0,
    });

    mockClientConnect.mockRejectedValueOnce(new StreamableHTTPError(500, 'Internal Server Error'));

    await manager.connect();

    expect(manager.getStatus()).toBe('error');
    expect(CallbackServer).not.toHaveBeenCalled();
  });

  it('does not initiate auto-OAuth when server has explicit client_credentials auth', async () => {
    const config: HttpServerConfig = {
      url: 'http://example.com/mcp',
      auth: { type: 'client_credentials', clientId: 'id', clientSecret: 'secret' },
    };
    const manager = new ServerManager('test-cc', config, {
      maxRestartAttempts: 0,
      healthCheckInterval: 0,
    });

    mockClientConnect.mockRejectedValueOnce(new UnauthorizedError());

    await manager.connect();

    // Should NOT trigger auto-OAuth, should result in error
    expect(manager.getStatus()).toBe('error');
    expect(CallbackServer).not.toHaveBeenCalled();
  });

  it('re-throws non-UnauthorizedError on HTTP server without auth config', async () => {
    const config: HttpServerConfig = { url: 'http://example.com/mcp' };
    const manager = new ServerManager('test-err', config, {
      maxRestartAttempts: 0,
      healthCheckInterval: 0,
    });

    mockClientConnect.mockRejectedValueOnce(new Error('connection refused'));

    await manager.connect();

    expect(manager.getStatus()).toBe('error');
    expect(manager.getState().error).toBe('connection refused');
    expect(CallbackServer).not.toHaveBeenCalled();
  });

  it('delegates explicit authorization_code auth to connectWithOAuth for streamable-http', async () => {
    const config: HttpServerConfig = {
      url: 'http://example.com/mcp',
      auth: { type: 'authorization_code' },
    };
    const manager = new ServerManager('test-explicit', config, {
      maxRestartAttempts: 0,
      healthCheckInterval: 0,
    });

    // connectWithOAuth: first connect throws UnauthorizedError, second succeeds
    mockClientConnect
      .mockRejectedValueOnce(new UnauthorizedError())
      .mockResolvedValueOnce(undefined);

    await manager.connect();

    expect(manager.getStatus()).toBe('connected');
    expect(CallbackServer).toHaveBeenCalled();
    expect(mockTransportFinishAuth).toHaveBeenCalledWith('test-auth-code');
    expect(StreamableHTTPClientTransport).toHaveBeenCalled();
  });

  it('delegates explicit authorization_code auth to connectWithOAuth for SSE', async () => {
    const config: HttpServerConfig = {
      url: 'http://example.com/mcp',
      transport: 'sse',
      auth: { type: 'authorization_code' },
    };
    const manager = new ServerManager('test-sse', config, {
      maxRestartAttempts: 0,
      healthCheckInterval: 0,
    });

    mockClientConnect
      .mockRejectedValueOnce(new UnauthorizedError())
      .mockResolvedValueOnce(undefined);

    await manager.connect();

    expect(manager.getStatus()).toBe('connected');
    expect(CallbackServer).toHaveBeenCalled();
    expect(SSEClientTransport).toHaveBeenCalled();
    expect(mockTransportFinishAuth).toHaveBeenCalledWith('test-auth-code');
  });

  it('connects directly when connectWithOAuth first attempt succeeds (tokens already stored)', async () => {
    const config: HttpServerConfig = {
      url: 'http://example.com/mcp',
      auth: { type: 'authorization_code' },
    };
    const manager = new ServerManager('test-cached', config, {
      maxRestartAttempts: 0,
      healthCheckInterval: 0,
    });

    // First connect succeeds (auth provider already has valid tokens)
    mockClientConnect.mockResolvedValueOnce(undefined);

    await manager.connect();

    expect(manager.getStatus()).toBe('connected');
    // finishAuth should NOT have been called since connect succeeded immediately
    expect(mockTransportFinishAuth).not.toHaveBeenCalled();
    // CallbackServer is still started (in case needed) but closed in finally
    expect(mockCallbackServerClose).toHaveBeenCalled();
  });

  it('sets error status when connectWithOAuth fails with non-auth error', async () => {
    const config: HttpServerConfig = {
      url: 'http://example.com/mcp',
      auth: { type: 'authorization_code' },
    };
    const manager = new ServerManager('test-fail', config, {
      maxRestartAttempts: 0,
      healthCheckInterval: 0,
    });

    mockClientConnect.mockRejectedValueOnce(new Error('network error'));

    await manager.connect();

    expect(manager.getStatus()).toBe('error');
    expect(manager.getState().error).toBe('network error');
  });

  it('passes headers and reconnection options through connectWithOAuth', async () => {
    const config: HttpServerConfig = {
      url: 'http://example.com/mcp',
      headers: { 'X-Custom': 'value' },
      sessionId: 'sess-123',
      reconnection: { maxDelay: 5000, initialDelay: 500 },
      auth: { type: 'authorization_code' },
    };
    const manager = new ServerManager('test-opts', config, {
      maxRestartAttempts: 0,
      healthCheckInterval: 0,
    });

    mockClientConnect.mockResolvedValueOnce(undefined);

    await manager.connect();

    expect(manager.getStatus()).toBe('connected');
    // Verify StreamableHTTPClientTransport was created with expected URL
    expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
      new URL('http://example.com/mcp'),
      expect.objectContaining({
        requestInit: { headers: { 'X-Custom': 'value' } },
        sessionId: 'sess-123',
        reconnectionOptions: expect.objectContaining({
          maxReconnectionDelay: 5000,
          initialReconnectionDelay: 500,
        }),
      })
    );
  });
});

describe('getAuthStatus', () => {
  it('returns undefined for stdio config', () => {
    const manager = new ServerManager('test-stdio', { command: 'echo' });
    expect(manager.getAuthStatus()).toBeUndefined();
  });

  it('returns undefined for HTTP config without auth and no stored tokens', () => {
    mockTokenStoreHasTokens.mockReturnValue(false);
    const manager = new ServerManager('test-noauth', { url: 'http://example.com/mcp' });
    expect(manager.getAuthStatus()).toBeUndefined();
  });

  it('returns auth info for HTTP config with explicit auth', () => {
    mockTokenStoreHasTokens.mockReturnValue(true);
    const config: HttpServerConfig = {
      url: 'http://example.com/mcp',
      auth: { type: 'authorization_code' },
    };
    const manager = new ServerManager('test-auth', config);
    expect(manager.getAuthStatus()).toEqual({
      type: 'authorization_code',
      hasTokens: true,
    });
  });

  it('returns auth info for explicit client_credentials auth', () => {
    mockTokenStoreHasTokens.mockReturnValue(false);
    const config: HttpServerConfig = {
      url: 'http://example.com/mcp',
      auth: { type: 'client_credentials', clientId: 'id', clientSecret: 'secret' },
    };
    const manager = new ServerManager('test-cc', config);
    expect(manager.getAuthStatus()).toEqual({
      type: 'client_credentials',
      hasTokens: false,
    });
  });

  it('returns authorization_code for HTTP without auth but with stored tokens', () => {
    mockTokenStoreHasTokens.mockReturnValue(true);
    const manager = new ServerManager('test-auto-stored', { url: 'http://example.com/mcp' });
    expect(manager.getAuthStatus()).toEqual({
      type: 'authorization_code',
      hasTokens: true,
    });
  });
});
