import type { Platform } from '../store.ts';

export interface Tokens {
  accessToken: string;
  refreshToken?: string | null;
  expiresIn?: number | null; // seconds
}

export interface Profile {
  externalId: string;
  username: string;
  displayName: string;
  avatar: string;
}

export interface Provider {
  id: Platform;
  name: string;
  /** Env vars that must be set for this provider to be usable. */
  envVars: string[];
  usesPkce: boolean;
  configured(): boolean;
  authUrl(params: { state: string; challenge: string; redirectUri: string }): string;
  exchange(params: { code: string; verifier: string; redirectUri: string }): Promise<Tokens>;
  profile(accessToken: string): Promise<Profile>;
  refresh?(refreshToken: string): Promise<Tokens>;
  /** MIME types this provider can attach. Empty means text-only. */
  mediaMimes: string[];
  maxMedia: number;
  publish(params: {
    accessToken: string;
    externalId: string;
    username: string;
    content: string;
    media: LocalMedia[];
  }): Promise<{ externalId: string; url?: string }>;
}

export interface LocalMedia {
  path: string;
  mime: string;
  name: string;
}

export class ProviderError extends Error {
  /** True when the token was rejected and the user must reconnect. */
  authFailure: boolean;
  constructor(message: string, authFailure = false) {
    super(message);
    this.authFailure = authFailure;
  }
}

export async function readJson(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}
