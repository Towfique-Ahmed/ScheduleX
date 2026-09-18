import { publishPost } from './publisher.ts';
import crypto from 'node:crypto';
import { collectAllMetrics } from './analytics.ts';
import { fetchAllInboxes } from './inbox.ts';
import { data, save } from './store.ts';

let running = false;

const DAY = 24 * 60 * 60 * 1000;

/** Evergreen posts are cloned back into the queue once their recycle interval has passed. */
export function recycleEvergreen(now = Date.now()) {
  let changed = false;
  for (const post of [...data().posts]) {
    if (post.status !== 'published' || !post.evergreen || post.recycledAt || !post.publishedAt) continue;
    if (new Date(post.publishedAt).getTime() + post.evergreen.everyDays * DAY > now) continue;
    data().posts.push({
      ...post,
      id: crypto.randomUUID(),
      status: 'scheduled',
      scheduledAt: new Date(now).toISOString(),
      publishedAt: null,
      results: [],
      recycledAt: null,
      recycledFrom: post.id,
      createdAt: new Date(now).toISOString(),
    });
    post.recycledAt = new Date(now).toISOString();
    changed = true;
  }
  if (changed) save();
}

async function tick() {
  if (running) return;
  running = true;
  try {
    recycleEvergreen();
    const now = Date.now();
    const due = data().posts.filter(p => p.status === 'scheduled' && p.scheduledAt && new Date(p.scheduledAt).getTime() <= now);
    for (const post of due) await publishPost(post);
  } catch (err) {
    console.error('[scheduler]', err);
  } finally {
    running = false;
  }
}

export function startScheduler(intervalMs = 15_000) {
  setInterval(tick, intervalMs);
  void tick();
  // Slow background jobs. Failures are recorded on the account, never thrown.
  const safe = (fn: () => Promise<void>) => () => { fn().catch(err => console.error('[scheduler]', err)); };
  setInterval(safe(collectAllMetrics), 6 * 60 * 60_000);
  setInterval(safe(fetchAllInboxes), 10 * 60_000);
  setTimeout(safe(collectAllMetrics), 30_000);
  setTimeout(safe(fetchAllInboxes), 45_000);
}
