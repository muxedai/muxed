import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type {
  OAuthClientMetadata,
  OAuthClientInformationMixed,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import type { ClientCredentialsAuth } from '../types.js';
import { TokenStore } from './token-store.js';

export class ClientCredentialsProvider implements OAuthClientProvider {
  private store: TokenStore;
  private config: ClientCredentialsAuth;

  constructor(config: ClientCredentialsAuth, serverName: string) {
    this.config = config;
    this.store = new TokenStore(serverName);
  }

  get redirectUrl(): undefined {
    return undefined;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [],
      token_endpoint_auth_method: 'client_secret_basic',
      grant_types: ['client_credentials'],
      response_types: [],
      client_name: 'toold',
    };
  }

  clientInformation(): OAuthClientInformationMixed {
    return {
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    };
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    return this.store.getTokens();
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    this.store.saveTokens(tokens);
  }

  redirectToAuthorization(): void {
    throw new Error('Client credentials flow does not use authorization redirects');
  }

  saveCodeVerifier(): void {
    // Not used for client credentials
  }

  codeVerifier(): string {
    return '';
  }

  prepareTokenRequest(scope?: string): URLSearchParams {
    const params = new URLSearchParams();
    params.set('grant_type', 'client_credentials');
    const effectiveScope = scope ?? this.config.scope;
    if (effectiveScope) {
      params.set('scope', effectiveScope);
    }
    return params;
  }

  invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier'): void {
    if (scope === 'all' || scope === 'tokens') {
      this.store.clearTokens();
    }
  }
}
