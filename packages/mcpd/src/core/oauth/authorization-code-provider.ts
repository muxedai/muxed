import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type {
  OAuthClientMetadata,
  OAuthClientInformationMixed,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import type { AuthorizationCodeAuth } from '../types.js';
import { TokenStore } from './token-store.js';
import { openBrowser, notifyReauth } from './notify.js';
import { getLogger } from '../../utils/logger.js';

export class AuthorizationCodeProvider implements OAuthClientProvider {
  private store: TokenStore;
  private config: AuthorizationCodeAuth;
  private _redirectUrl: string | undefined;
  private hadTokensBefore = false;

  constructor(
    config: AuthorizationCodeAuth,
    private readonly serverName: string
  ) {
    this.config = config;
    this.store = new TokenStore(serverName);
    // Track whether tokens existed before this session (for re-auth notification logic)
    this.hadTokensBefore = this.store.hasTokens();
  }

  /**
   * Set the redirect URL once the callback server port is known.
   */
  setRedirectUrl(port: number): void {
    this._redirectUrl = `http://127.0.0.1:${port}/oauth/callback`;
  }

  get redirectUrl(): string | undefined {
    return this._redirectUrl;
  }

  get clientMetadata(): OAuthClientMetadata {
    const redirectUri = this._redirectUrl ?? 'http://127.0.0.1/oauth/callback';
    return {
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: this.config.clientSecret ? 'client_secret_basic' : 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      client_name: 'mcpd',
      scope: this.config.scope,
    };
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    // If pre-registered client ID is provided in config, use it
    if (this.config.clientId) {
      return {
        client_id: this.config.clientId,
        ...(this.config.clientSecret ? { client_secret: this.config.clientSecret } : {}),
      };
    }
    // Otherwise, check for dynamically registered client info
    return this.store.getClientInformation();
  }

  saveClientInformation(info: OAuthClientInformationMixed): void {
    this.store.saveClientInformation(info);
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    return this.store.getTokens();
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    this.store.saveTokens(tokens);
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    const url = authorizationUrl.toString();
    if (this.hadTokensBefore) {
      // Re-auth: send notification instead of opening browser directly
      getLogger().info(`Re-authorization needed for "${this.serverName}"`, this.serverName);
      await notifyReauth(this.serverName, url);
    } else {
      // First-time auth: open browser directly
      getLogger().info(
        `Opening browser for authorization of "${this.serverName}"`,
        this.serverName
      );
      openBrowser(url);
    }
  }

  saveCodeVerifier(codeVerifier: string): void {
    this.store.saveCodeVerifier(codeVerifier);
  }

  codeVerifier(): string {
    return this.store.getCodeVerifier() ?? '';
  }

  invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier'): void {
    // Record that tokens existed before invalidation (for re-auth behavior)
    if (scope === 'all' || scope === 'tokens') {
      if (this.store.hasTokens()) {
        this.hadTokensBefore = true;
      }
    }

    switch (scope) {
      case 'all':
        this.store.clearAll();
        break;
      case 'client':
        this.store.clearClientInformation();
        break;
      case 'tokens':
        this.store.clearTokens();
        break;
      case 'verifier':
        this.store.clearCodeVerifier();
        break;
    }
  }
}
