import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type { OAuthConfig } from '../types.js';
import { ClientCredentialsProvider } from './client-credentials-provider.js';
import { AuthorizationCodeProvider } from './authorization-code-provider.js';

export { TokenStore } from './token-store.js';
export { CallbackServer } from './callback-server.js';
export { AuthorizationCodeProvider } from './authorization-code-provider.js';
export { ClientCredentialsProvider } from './client-credentials-provider.js';

export function createAuthProvider(config: OAuthConfig, serverName: string): OAuthClientProvider {
  switch (config.type) {
    case 'client_credentials':
      return new ClientCredentialsProvider(config, serverName);
    case 'authorization_code':
      return new AuthorizationCodeProvider(config, serverName);
  }
}
