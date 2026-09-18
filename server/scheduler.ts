import { publishPost } from './publisher.ts';
import crypto from 'node:crypto';
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
}
