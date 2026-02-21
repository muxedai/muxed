import fs from 'node:fs';
import path from 'node:path';
import type { OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { OAuthClientInformationMixed } from '@modelcontextprotocol/sdk/shared/auth.js';
import { getMcpdDir } from '../../utils/paths.js';

type StoredData = {
  tokens?: OAuthTokens;
  clientInformation?: OAuthClientInformationMixed;
  codeVerifier?: string;
};

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function getAuthDir(): string {
  return path.join(getMcpdDir(), 'auth');
}

function getStorePath(serverName: string): string {
  return path.join(getAuthDir(), `${sanitizeName(serverName)}.json`);
}

function ensureAuthDir(): void {
  fs.mkdirSync(getAuthDir(), { recursive: true, mode: 0o700 });
}

function readStore(serverName: string): StoredData {
  const filePath = getStorePath(serverName);
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as StoredData;
  } catch {
    return {};
  }
}

function writeStore(serverName: string, data: StoredData): void {
  ensureAuthDir();
  const filePath = getStorePath(serverName);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), { mode: 0o600 });
}

export class TokenStore {
  constructor(private readonly serverName: string) {}

  getTokens(): OAuthTokens | undefined {
    return readStore(this.serverName).tokens;
  }

  saveTokens(tokens: OAuthTokens): void {
    const data = readStore(this.serverName);
    data.tokens = tokens;
    writeStore(this.serverName, data);
  }

  getClientInformation(): OAuthClientInformationMixed | undefined {
    return readStore(this.serverName).clientInformation;
  }

  saveClientInformation(info: OAuthClientInformationMixed): void {
    const data = readStore(this.serverName);
    data.clientInformation = info;
    writeStore(this.serverName, data);
  }

  getCodeVerifier(): string | undefined {
    return readStore(this.serverName).codeVerifier;
  }

  saveCodeVerifier(verifier: string): void {
    const data = readStore(this.serverName);
    data.codeVerifier = verifier;
    writeStore(this.serverName, data);
  }

  clearTokens(): void {
    const data = readStore(this.serverName);
    delete data.tokens;
    writeStore(this.serverName, data);
  }

  clearClientInformation(): void {
    const data = readStore(this.serverName);
    delete data.clientInformation;
    writeStore(this.serverName, data);
  }

  clearCodeVerifier(): void {
    const data = readStore(this.serverName);
    delete data.codeVerifier;
    writeStore(this.serverName, data);
  }

  clearAll(): void {
    const filePath = getStorePath(this.serverName);
    try {
      fs.unlinkSync(filePath);
    } catch {
      // Ignore if doesn't exist
    }
  }

  hasTokens(): boolean {
    return readStore(this.serverName).tokens !== undefined;
  }
}
