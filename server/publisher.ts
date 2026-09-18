import path from 'node:path';
import { decrypt, encrypt } from './crypto.ts';
import { providers } from './providers/index.ts';
import { config } from './config.ts';
import { LocalMedia, ProviderError } from './providers/types.ts';
import { data, mediaDir, save, StoredAccount, StoredPost, PublishResult } from './store.ts';

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export function storeTokens(account: StoredAccount, t: { accessToken: string; refreshToken?: string | null; expiresIn?: number | null }) {
  account.accessToken = encrypt(t.accessToken);
  if (t.refreshToken) account.refreshToken = encrypt(t.refreshToken);
  account.expiresAt = t.expiresIn ? new Date(Date.now() + t.expiresIn * 1000).toISOString() : null;
  account.needsReconnect = false;
}

const refreshing = new Map<string, Promise<void>>();

/** Refreshes an account's tokens once, even if several callers (publish, inbox, metrics) ask at the same moment. */
function refreshOnce(account: StoredAccount): Promise<void> {
  const existing = refreshing.get(account.id);
  if (existing) return existing;
  const provider = providers[account.platform]!;
  const job = (async () => {
    try {
      storeTokens(account, await provider.refresh!(decrypt(account.refreshToken!)));
      save();
    } catch (err) {
      // Only a rejected grant needs the user; timeouts, 429s and 5xx will succeed on a later attempt.
      if (err instanceof ProviderError && err.authFailure) {
        account.needsReconnect = true;
        save();
      }
      throw err;
    }
  })().finally(() => refreshing.delete(account.id));
  refreshing.set(account.id, job);
  return job;
}

/** Returns a usable access token, refreshing it first if it is about to expire. */
export async function accessTokenFor(account: StoredAccount): Promise<string> {
  const provider = providers[account.platform]!;
  const expiring = account.expiresAt && new Date(account.expiresAt).getTime() - Date.now() < REFRESH_MARGIN_MS;
  if (expiring) {
    if (!provider.refresh || !account.refreshToken) {
      account.needsReconnect = true;
      save();
      throw new ProviderError(`${provider.name} access expired — reconnect the account`, true);
    }
    await refreshOnce(account);
  }
  return decrypt(account.accessToken);
}

async function publishToAccount(accountId: string, post: StoredPost): Promise<PublishResult> {
  const account = data().accounts.find(a => a.id === accountId);
  if (!account) return { accountId, status: 'failed', error: 'Account was disconnected' };
  const provider = providers[account.platform];
  if (!provider) return { accountId, status: 'failed', error: 'Platform not supported' };

  const media: LocalMedia[] = [];
  for (const id of post.mediaIds) {
    const m = data().media.find(x => x.id === id);
    if (!m) return { accountId, status: 'failed', error: 'An attached media file was deleted' };
    if (!provider.mediaMimes.includes(m.mime)) {
      return { accountId, status: 'failed', error: `${provider.name} can't post ${m.mime} files yet` };
    }
    media.push({
      path: path.join(mediaDir, m.filename), mime: m.mime, name: m.originalName,
      publicUrl: config.publicUrl ? `${config.publicUrl}/api/media/file/${m.filename}` : undefined,
    });
  }
  if (provider.requiresMedia && media.length === 0) {
    return { accountId, status: 'failed', error: `${provider.name} posts need an image or video` };
  }
  if (media.length > provider.maxMedia) {
    return { accountId, status: 'failed', error: `${provider.name} allows at most ${provider.maxMedia} attachments` };
  }

  try {
    const accessToken = await accessTokenFor(account);
    const out = await provider.publish({ accessToken, externalId: account.externalId, username: account.username, content: post.content, media });
    return { accountId, status: 'published', externalId: out.externalId, url: out.url };
  } catch (err) {
    if (err instanceof ProviderError && err.authFailure) {
      account.needsReconnect = true;
      save();
    }
    return { accountId, status: 'failed', error: err instanceof Error ? err.message : String(err) };
  }
}

const inFlight = new Set<string>();

/**
 * Publishes a post to every selected account; only accounts that have not yet succeeded are attempted.
 * Each account's result is saved the moment it arrives, so a crash mid-way never forgets a success
 * (which would re-post to that account on restart).
 */
export async function publishPost(post: StoredPost) {
  // A post can be reached from the scheduler, "publish now", retry and recycling; never run it twice at once.
  if (inFlight.has(post.id) || post.status === 'publishing') return;
  inFlight.add(post.id);
  try {
    post.status = 'publishing';
    save();
    const record = (r: PublishResult) => {
      post.results = [...post.results.filter(x => x.accountId !== r.accountId), r];
      save();
    };
    const todo = post.accounts.filter(id => !post.results.some(r => r.accountId === id && r.status === 'published'));
    // Drop stale failures for accounts we are about to retry.
    post.results = post.results.filter(r => r.status === 'published' || !todo.includes(r.accountId));
    // Any unexpected throw becomes a failed result, so a post can never stay stuck in 'publishing'.
    await Promise.all(todo.map(async id => {
      record(await publishToAccount(id, post).catch((err): PublishResult => ({
        accountId: id, status: 'failed', error: err instanceof Error ? err.message : String(err),
      })));
    }));
    const ok = post.accounts.every(id => post.results.some(r => r.accountId === id && r.status === 'published'));
    post.status = ok ? 'published' : 'failed';
    if (ok) post.publishedAt = new Date().toISOString();
    save();
  } finally {
    inFlight.delete(post.id);
  }
}
