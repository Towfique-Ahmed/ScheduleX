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

export interface Metrics {
  followers?: number;
  impressions?: number;
  engagements?: number;
  clicks?: number;
}

export interface InboxEntry {
  externalId: string;
  author: string;
  text: string;
  at: string;
  url?: string;
  /** Snippet of the post being commented on. */
  context?: string;
}

interface Auth {
  accessToken: string;
  externalId: string;
  username: string;
}

/** One connectable account. A single login can yield several (Facebook Pages, Pinterest boards). */
export interface ConnectedAccount extends Tokens {
  profile: Profile;
}

export interface Provider {
  id: Platform;
  name: string;
  /** Env vars that must be set for this provider to be usable. */
  envVars: string[];
  usesPkce: boolean;
  configured(): boolean;
  authUrl(params: { state: string; challenge: string; verifier: string; redirectUri: string }): string;
  exchange(params: { code: string; verifier: string; redirectUri: string }): Promise<Tokens>;
  profile(accessToken: string): Promise<Profile>;
  /** Overrides profile() when one login maps to several accounts, each with its own token. */
  accounts?(tokens: Tokens): Promise<ConnectedAccount[]>;
  refresh?(refreshToken: string): Promise<Tokens>;
  /** MIME types this provider can attach. Empty means text-only. */
  mediaMimes: string[];
  maxMedia: number;
  /** Audience/performance numbers. Absent when the platform's API doesn't offer them to ordinary apps. */
  metrics?(auth: Auth): Promise<Metrics>;
  /** Why metrics are unavailable, shown in the UI. */
  metricsNote?: string;
  /** Recent comments/mentions on this account. */
  inbox?(auth: Auth): Promise<InboxEntry[]>;
  reply?(auth: Auth & { itemExternalId: string; text: string }): Promise<void>;
  /** True when a post cannot be text-only (Instagram, TikTok, Pinterest). */
  requiresMedia?: boolean;
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
  /** Publicly reachable URL, for platforms that pull media themselves (Instagram). Undefined when PUBLIC_URL isn't set. */
  publicUrl?: string;
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

/**
 * A token endpoint rejecting the request with 4xx (except throttling/timeouts) means the grant is dead and
 * the user must reconnect. 429, 5xx and network failures are transient and must not disconnect anyone.
 */
export const isDeadGrant = (status: number) => status >= 400 && status < 500 && status !== 429 && status !== 408;
