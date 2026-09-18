import crypto from 'node:crypto';
import { accessTokenFor } from './publisher.ts';
import { providers } from './providers/index.ts';
import { ProviderError } from './providers/types.ts';
import { data, save, StoredAccount } from './store.ts';

const KEEP = 500;

/** Pulls recent comments/mentions for one account; new ones are added unread, existing ones are left alone. */
export async function fetchInbox(account: StoredAccount): Promise<number> {
  const provider = providers[account.platform];
  if (!provider?.inbox || account.needsReconnect) return 0;
  let added = 0;
  try {
    const entries = await provider.inbox({ accessToken: await accessTokenFor(account), externalId: account.externalId, username: account.username });
    const db = data();
    for (const e of entries) {
      if (db.inbox.some(i => i.accountId === account.id && i.externalId === e.externalId)) continue;
      db.inbox.push({ id: crypto.randomUUID(), accountId: account.id, ...e, read: false, reply: null });
      added++;
    }
    db.inbox.sort((a, b) => b.at.localeCompare(a.at));
    db.inbox = db.inbox.slice(0, KEEP);
    account.inboxError = null;
  } catch (err) {
    if (err instanceof ProviderError && err.authFailure) account.needsReconnect = true;
    account.inboxError = err instanceof Error ? err.message : String(err);
  }
  save();
  return added;
}

export async function fetchAllInboxes() {
  for (const a of [...data().accounts]) await fetchInbox(a);
}

export async function sendReply(itemId: string, text: string, byUserId: string) {
  const db = data();
  const item = db.inbox.find(i => i.id === itemId);
  if (!item) throw new ProviderError('Message not found');
  const account = db.accounts.find(a => a.id === item.accountId);
  const provider = account && providers[account.platform];
  if (!account || !provider?.reply) throw new ProviderError('Replies are not supported for this account');
  await provider.reply({ accessToken: await accessTokenFor(account), externalId: account.externalId, username: account.username, itemExternalId: item.externalId, text });
  item.reply = { text, by: byUserId, at: new Date().toISOString() };
  item.read = true;
  save();
  return item;
}
