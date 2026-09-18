import path from 'node:path';
import { decrypt, encrypt } from './crypto.ts';
import { providers } from './providers/index.ts';
import { LocalMedia, ProviderError } from './providers/types.ts';
import { data, mediaDir, save, StoredAccount, StoredPost, PublishResult } from './store.ts';

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export function storeTokens(account: StoredAccount, t: { accessToken: string; refreshToken?: string | null; expiresIn?: number | null }) {
  account.accessToken = encrypt(t.accessToken);
  if (t.refreshToken) account.refreshToken = encrypt(t.refreshToken);
  account.expiresAt = t.expiresIn ? new Date(Date.now() + t.expiresIn * 1000).toISOString() : null;
  account.needsReconnect = false;
}

/** Returns a usable access token, refreshing it first if it is about to expire. */
async function validToken(account: StoredAccount): Promise<string> {
  const provider = providers[account.platform]!;
  const expiring = account.expiresAt && new Date(account.expiresAt).getTime() - Date.now() < REFRESH_MARGIN_MS;
  if (expiring) {
    if (!provider.refresh || !account.refreshToken) {
      account.needsReconnect = true;
      save();
      throw new ProviderError(`${provider.name} access expired — reconnect the account`, true);
    }
    try {
      storeTokens(account, await provider.refresh(decrypt(account.refreshToken)));
      save();
    } catch (err) {
      account.needsReconnect = true;
      save();
      throw err;
    }
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
    media.push({ path: path.join(mediaDir, m.filename), mime: m.mime, name: m.originalName });
  }
  if (media.length > provider.maxMedia) {
    return { accountId, status: 'failed', error: `${provider.name} allows at most ${provider.maxMedia} attachments` };
  }

  try {
    const accessToken = await validToken(account);
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

/** Publishes a post to every selected account; only accounts that have not yet succeeded are attempted. */
export async function publishPost(post: StoredPost) {
  post.status = 'publishing';
  save();
  const done = new Map(post.results.filter(r => r.status === 'published').map(r => [r.accountId, r]));
  // Any unexpected throw becomes a failed result, so a post can never stay stuck in 'publishing'.
  const fresh = await Promise.all(
    post.accounts.filter(id => !done.has(id)).map(id =>
      publishToAccount(id, post).catch((err): PublishResult => ({
        accountId: id,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      })),
    ),
  );
  post.results = [...done.values(), ...fresh];
  const ok = post.results.every(r => r.status === 'published');
  post.status = ok ? 'published' : 'failed';
  if (ok) post.publishedAt = new Date().toISOString();
  save();
}
