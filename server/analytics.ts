import { accessTokenFor } from './publisher.ts';
import { providers } from './providers/index.ts';
import { ProviderError } from './providers/types.ts';
import { data, save, Platform, StoredAccount } from './store.ts';

const dayOf = (d: Date) => d.toISOString().slice(0, 10);

/** Fetches audience numbers for one account and stores today's snapshot. */
export async function collectMetrics(account: StoredAccount): Promise<void> {
  const provider = providers[account.platform];
  if (!provider?.metrics || account.needsReconnect) return;
  try {
    const m = await provider.metrics({ accessToken: await accessTokenFor(account), externalId: account.externalId, username: account.username });
    const day = dayOf(new Date());
    const db = data();
    db.snapshots = db.snapshots.filter(s => !(s.accountId === account.id && s.day === day));
    db.snapshots.push({ accountId: account.id, day, ...m });
    const cutoff = dayOf(new Date(Date.now() - 400 * 86400_000));
    db.snapshots = db.snapshots.filter(s => s.day >= cutoff);
    account.metricsError = null;
    account.metricsAt = new Date().toISOString();
  } catch (err) {
    if (err instanceof ProviderError && err.authFailure) account.needsReconnect = true;
    account.metricsError = err instanceof Error ? err.message : String(err);
  }
  save();
}

export async function collectAllMetrics() {
  for (const a of [...data().accounts]) await collectMetrics(a);
}

// ---- Reporting ----------------------------------------------------------------------------
export interface PlatformRow { platform: Platform; published: number; failed: number }

export function publishingStats(days: number) {
  const db = data();
  const since = Date.now() - days * 86400_000;
  const byDay = new Map<string, { published: number; failed: number }>();
  for (let i = days - 1; i >= 0; i--) byDay.set(dayOf(new Date(Date.now() - i * 86400_000)), { published: 0, failed: 0 });
  const byPlatform = new Map<Platform, PlatformRow>();
  const byCategory = new Map<string, number>();
  let published = 0, failed = 0;

  for (const post of db.posts) {
    const when = new Date(post.publishedAt ?? post.scheduledAt ?? post.createdAt);
    if (when.getTime() < since || when.getTime() > Date.now()) continue;
    for (const r of post.results) {
      const platform = db.accounts.find(a => a.id === r.accountId)?.platform;
      if (!platform) continue;
      const row = byPlatform.get(platform) ?? { platform, published: 0, failed: 0 };
      const day = byDay.get(dayOf(when));
      if (r.status === 'published') { published++; row.published++; if (day) day.published++; if (post.categoryId) byCategory.set(post.categoryId, (byCategory.get(post.categoryId) ?? 0) + 1); }
      else { failed++; row.failed++; if (day) day.failed++; }
      byPlatform.set(platform, row);
    }
  }
  const count = (s: string) => db.posts.filter(p => p.status === s).length;
  return {
    published, failed,
    successRate: published + failed ? Math.round((published / (published + failed)) * 1000) / 10 : null,
    scheduled: count('scheduled'), drafts: count('draft'), pending: count('pending_approval'),
    byDay: [...byDay].map(([date, v]) => ({ date, ...v })),
    byPlatform: [...byPlatform.values()],
    byCategory: [...byCategory].map(([categoryId, published]) => ({ categoryId, published, name: db.categories.find(c => c.id === categoryId)?.name ?? 'Deleted category' })),
  };
}

export function audience(days: number) {
  const db = data();
  const from = dayOf(new Date(Date.now() - days * 86400_000));
  return db.accounts.map(a => {
    const p = providers[a.platform];
    const series = db.snapshots.filter(s => s.accountId === a.id && s.day >= from).sort((x, y) => x.day.localeCompare(y.day));
    const latest = series[series.length - 1];
    const first = series[0];
    return {
      accountId: a.id, platform: a.platform, displayName: a.displayName, username: a.username,
      supported: !!p?.metrics, note: p?.metrics ? null : p?.metricsNote ?? 'Not available for this platform.',
      error: a.metricsError ?? null, updatedAt: a.metricsAt ?? null,
      latest: latest ? { followers: latest.followers, impressions: latest.impressions, engagements: latest.engagements, clicks: latest.clicks } : null,
      followerChange: latest?.followers !== undefined && first?.followers !== undefined && series.length > 1 ? latest.followers - first.followers : null,
      series: series.map(s => ({ day: s.day, followers: s.followers ?? null })),
    };
  });
}

// ---- CSV ------------------------------------------------------------------------------------
/** Escapes a CSV cell and defuses spreadsheet formulas (=, +, -, @ at the start) from user content. */
const cell = (v: unknown) => {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const csvRow = (cols: unknown[]) => cols.map(cell).join(',');

export function reportCsv(days: number): string {
  const stats = publishingStats(days);
  const aud = audience(days);
  const db = data();
  const lines: string[] = [];
  lines.push(csvRow(['ScheduleX report', `last ${days} days`, new Date().toISOString()]), '');
  lines.push(csvRow(['Publishing summary']), csvRow(['Published', 'Failed', 'Success rate %', 'Scheduled', 'Drafts', 'Awaiting approval']));
  lines.push(csvRow([stats.published, stats.failed, stats.successRate ?? '', stats.scheduled, stats.drafts, stats.pending]), '');
  lines.push(csvRow(['By platform']), csvRow(['Platform', 'Published', 'Failed']));
  for (const r of stats.byPlatform) lines.push(csvRow([r.platform, r.published, r.failed]));
  lines.push('', csvRow(['By day']), csvRow(['Date', 'Published', 'Failed']));
  for (const d of stats.byDay) lines.push(csvRow([d.date, d.published, d.failed]));
  lines.push('', csvRow(['Audience']), csvRow(['Platform', 'Account', 'Followers', 'Follower change', 'Impressions (28d)', 'Engagements (28d)', 'Clicks (28d)', 'Note']));
  for (const a of aud) lines.push(csvRow([a.platform, a.displayName, a.latest?.followers, a.followerChange, a.latest?.impressions, a.latest?.engagements, a.latest?.clicks, a.note ?? a.error ?? '']));
  lines.push('', csvRow(['Posts']), csvRow(['Date', 'Status', 'Accounts', 'Category', 'Content']));
  for (const p of db.posts.filter(p => new Date(p.publishedAt ?? p.scheduledAt ?? p.createdAt).getTime() >= Date.now() - days * 86400_000)) {
    lines.push(csvRow([
      p.publishedAt ?? p.scheduledAt ?? p.createdAt, p.status,
      p.accounts.map(id => db.accounts.find(a => a.id === id)?.displayName ?? '?').join('; '),
      db.categories.find(c => c.id === p.categoryId)?.name ?? '', p.content,
    ]));
  }
  return lines.join('\r\n') + '\r\n';
}
