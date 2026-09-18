import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { authRouter, originCheck, requireRole, requireUser, sessionMiddleware, teamRouter, userFrom } from './auth.ts';
import { config, redirectUri } from './config.ts';
import { can } from './roles.ts';
import { publishPost, storeTokens } from './publisher.ts';
import { allPlatforms, providers } from './providers/index.ts';
import { startScheduler } from './scheduler.ts';
import { data, mediaDir, save, Platform, StoredAccount, StoredMedia, StoredPost, User } from './store.ts';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use('/api', sessionMiddleware, originCheck);

// ---- Public: sign-in, and media by unguessable URL (Instagram must fetch images from a public link) ----
app.use('/api', authRouter);
app.get('/api/media/file/:filename', (req, res) => {
  const m = data().media.find(x => x.filename === req.params.filename);
  if (!m) return res.status(404).end();
  res.setHeader('Content-Type', m.mime);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.sendFile(path.join(mediaDir, m.filename));
});




// Never leak tokens to the browser.
const publicAccount = ({ accessToken, refreshToken, ...rest }: StoredAccount) => ({ ...rest, connected: !rest.needsReconnect });

// ---- OAuth ------------------------------------------------------------------
interface Pending { platform: Platform; verifier: string; expires: number; userId: string }
const pending = new Map<string, Pending>();

const b64url = (b: Buffer) => b.toString('base64url');
const back = (params: Record<string, string>) => `${config.appUrl}/accounts?${new URLSearchParams(params)}`;

/** OAuth endpoints are browser navigations, so failures redirect back with a message instead of returning JSON. */
function adminOrRedirect(res: express.Response): User | null {
  const user = res.locals.user as User | undefined;
  if (!user) { res.redirect(back({ error: 'Sign in to connect an account.' })); return null; }
  if (!can.manageAccounts(user.role)) { res.redirect(back({ error: 'Only admins can connect accounts.' })); return null; }
  return user;
}

app.get('/api/auth/:platform/start', (req, res) => {
  const user = adminOrRedirect(res);
  if (!user) return;
  const platform = req.params.platform as Platform;
  const provider = providers[platform];
  if (!provider) return res.redirect(back({ error: 'This platform is not supported yet.' }));
  if (!provider.configured()) return res.redirect(back({ error: `${provider.name} is not configured. Set ${provider.envVars.join(', ')} on the server.` }));

  for (const [k, v] of pending) if (v.expires < Date.now()) pending.delete(k);
  const state = b64url(crypto.randomBytes(24));
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  pending.set(state, { platform, verifier, userId: user.id, expires: Date.now() + 10 * 60 * 1000 });
  res.redirect(provider.authUrl({ state, challenge, verifier, redirectUri: redirectUri(platform) }));
});

app.get('/api/auth/:platform/callback', async (req, res) => {
  const user = adminOrRedirect(res);
  if (!user) return;
  const platform = req.params.platform as Platform;
  const provider = providers[platform];
  const { code, state, error, error_description } = req.query as Record<string, string | undefined>;
  const entry = state ? pending.get(state) : undefined;
  if (state) pending.delete(state);

  if (!provider || !entry || entry.platform !== platform || entry.userId !== user.id || entry.expires < Date.now()) {
    return res.redirect(back({ error: 'The connection attempt expired or was invalid. Please try again.' }));
  }
  if (error || !code) return res.redirect(back({ error: error_description ?? error ?? 'Authorization was cancelled.' }));

  try {
    const tokens = await provider.exchange({ code, verifier: entry.verifier, redirectUri: redirectUri(platform) });
    // Most platforms map one login to one account; Meta and Pinterest yield several (Pages, boards).
    const connected = provider.accounts
      ? await provider.accounts(tokens)
      : [{ ...tokens, profile: await provider.profile(tokens.accessToken) }];
    for (const { profile, ...t } of connected) {
      const existing = data().accounts.find(a => a.platform === platform && a.externalId === profile.externalId);
      const account: StoredAccount = existing ?? {
        id: crypto.randomUUID(),
        platform,
        externalId: profile.externalId,
        username: profile.username,
        displayName: profile.displayName,
        avatar: profile.avatar,
        accessToken: '',
        refreshToken: null,
        expiresAt: null,
        needsReconnect: false,
        connectedAt: new Date().toISOString(),
      };
      Object.assign(account, { username: profile.username, displayName: profile.displayName, avatar: profile.avatar });
      storeTokens(account, t);
      if (!existing) data().accounts.push(account);
    }
    save();
    res.redirect(back({ connected: platform, count: String(connected.length) }));
    return;

  } catch (err) {
    console.error(`[auth:${platform}]`, err);
    res.redirect(back({ error: err instanceof Error ? err.message : 'Connection failed.' }));
  }
});


// ---- Everything below requires a signed-in user ----
app.use('/api', requireUser);
app.use('/api', teamRouter);

// ---- Providers ------------------------------------------------------------
app.get('/api/providers', (_req, res) => {
  res.json(
    allPlatforms.map(id => {
      const p = providers[id];
      return {
        platform: id,
        supported: !!p,
        configured: !!p?.configured(),
        envVars: p?.envVars ?? [],
        redirectUri: p ? redirectUri(id) : null,
        mediaMimes: p?.mediaMimes ?? [],
        maxMedia: p?.maxMedia ?? 0,
        requiresMedia: !!p?.requiresMedia,
      };
    }),
  );
});

// ---- Accounts ---------------------------------------------------------------
app.get('/api/accounts', (_req, res) => res.json(data().accounts.map(publicAccount)));

app.delete('/api/accounts/:id', requireRole(can.manageAccounts), (req, res) => {
  const db = data();
  const idx = db.accounts.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  db.accounts.splice(idx, 1);
  save();
  res.status(204).end();
});

// ---- Media ------------------------------------------------------------------
const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'video/mp4': 'mp4',
};

/** Checks the file's real signature so a mislabelled upload can't masquerade as an image. */
function sniffMime(b: Buffer): string | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.subarray(0, 4).toString('latin1') === 'GIF8') return 'image/gif';
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (b.subarray(4, 8).toString('latin1') === 'ftyp') return 'video/mp4';
  return null;
}

const publicMedia = (m: StoredMedia) => ({
  id: m.id, name: m.originalName, mime: m.mime, size: m.size, createdAt: m.createdAt, url: `/api/media/file/${m.filename}`,
});

app.get('/api/media', (_req, res) => res.json(data().media.map(publicMedia)));

app.post('/api/media', requireRole(can.draft), express.raw({ type: ['image/*', 'video/*'], limit: '25mb' }), (req, res) => {
  const body = req.body as Buffer;
  if (!Buffer.isBuffer(body) || body.length === 0) return res.status(400).json({ error: 'No file received' });
  const mime = sniffMime(body);
  if (!mime) return res.status(415).json({ error: 'Unsupported file. Upload a JPG, PNG, GIF, WebP or MP4.' });
  const raw = decodeURIComponent(String(req.header('x-filename') ?? 'upload'));
  const originalName = raw.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'upload';
  const id = crypto.randomUUID();
  const filename = `${id}.${MIME_EXT[mime]}`;
  fs.mkdirSync(mediaDir, { recursive: true });
  fs.writeFileSync(path.join(mediaDir, filename), body);
  const media: StoredMedia = { id, filename, originalName, mime, size: body.length, createdAt: new Date().toISOString() };
  data().media.push(media);
  save();
  res.status(201).json(publicMedia(media));
});

app.delete('/api/media/:id', requireRole(can.deleteMedia), (req, res) => {
  const db = data();
  const idx = db.media.findIndex(m => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  if (db.posts.some(p => p.status !== 'published' && p.mediaIds.includes(String(req.params.id)))) {
    return res.status(409).json({ error: 'This file is attached to a draft or scheduled post.' });
  }
  const [m] = db.media.splice(idx, 1);
  fs.rmSync(path.join(mediaDir, m.filename), { force: true });
  save();
  res.status(204).end();
});

// ---- Categories & queue slots -------------------------------------------------
app.get('/api/categories', (_req, res) => res.json(data().categories));

app.post('/api/categories', requireRole(can.manageCategories), (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  const color = String(req.body?.color ?? '#6366f1');
  if (!name || name.length > 40) return res.status(400).json({ error: 'Name must be 1–40 characters' });
  if (!/^#[0-9a-f]{6}$/i.test(color)) return res.status(400).json({ error: 'Invalid color' });
  if (data().categories.some(c => c.name.toLowerCase() === name.toLowerCase())) return res.status(409).json({ error: 'That category already exists' });
  const category = { id: crypto.randomUUID(), name, color };
  data().categories.push(category);
  save();
  res.status(201).json(category);
});

app.delete('/api/categories/:id', requireRole(can.manageCategories), (req, res) => {
  const db = data();
  const idx = db.categories.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  db.categories.splice(idx, 1);
  for (const p of db.posts) if (p.categoryId === req.params.id) p.categoryId = null;
  save();
  res.status(204).end();
});

app.get('/api/slots', (_req, res) => res.json(data().slots));

app.put('/api/slots', requireRole(can.manageSlots), (req, res) => {
  const slots = req.body?.slots;
  if (!Array.isArray(slots) || slots.length > 100) return res.status(400).json({ error: 'slots must be an array' });
  const seen = new Set<string>();
  const clean = [];
  for (const s of slots) {
    if (!Number.isInteger(s?.day) || s.day < 0 || s.day > 6 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(s?.time)) {
      return res.status(400).json({ error: 'Each slot needs day 0–6 and time HH:MM' });
    }
    const key = `${s.day}-${s.time}`;
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push({ id: crypto.randomUUID(), day: s.day as number, time: s.time as string });
  }
  data().slots = clean;
  save();
  res.json(clean);
});

// ---- Posts ------------------------------------------------------------------
interface PostFields {
  content: string;
  accounts: string[];
  mediaIds: string[];
  categoryId: string | null;
  evergreen: { everyDays: number } | null;
}

/** Validates the fields shared by create and edit. Only keys present in `body` are checked and returned. */
function parseFields(body: any): { error: string } | { fields: Partial<PostFields> } {
  const db = data();
  const f: Partial<PostFields> = {};
  if ('content' in body) {
    if (typeof body.content !== 'string' || !body.content.trim()) return { error: 'Content is required' };
    f.content = body.content;
  }
  if ('accounts' in body) {
    if (!Array.isArray(body.accounts)) return { error: 'accounts must be an array' };
    f.accounts = db.accounts.filter(a => body.accounts.includes(a.id)).map(a => a.id);
  }
  if ('mediaIds' in body) {
    if (!Array.isArray(body.mediaIds) || body.mediaIds.length > 10) return { error: 'mediaIds must be an array of up to 10 ids' };
    if (!body.mediaIds.every((id: string) => db.media.some(m => m.id === id))) return { error: 'Unknown media file' };
    f.mediaIds = body.mediaIds;
  }
  if ('categoryId' in body) {
    if (body.categoryId !== null && !db.categories.some(c => c.id === body.categoryId)) return { error: 'Unknown category' };
    f.categoryId = body.categoryId;
  }
  if ('evergreen' in body) {
    const e = body.evergreen;
    if (e !== null && !(Number.isInteger(e?.everyDays) && e.everyDays >= 1 && e.everyDays <= 365)) {
      return { error: 'evergreen.everyDays must be a whole number from 1 to 365' };
    }
    f.evergreen = e;
  }
  return { fields: f };
}

function parseSchedule(value: unknown): { error: string } | { at: string } {
  const t = new Date(value as string);
  if (!value || isNaN(t.getTime())) return { error: 'A valid schedule time is required' };
  if (t.getTime() < Date.now() - 60_000) return { error: 'Schedule time is in the past' };
  return { at: t.toISOString() };
}

/** Rejects combinations a platform can't publish (e.g. video to X, text-only to Instagram) before they're scheduled. */
function mediaProblem(accountIds: string[], mediaIds: string[]): string | null {
  const db = data();
  const files = mediaIds.map(id => db.media.find(m => m.id === id)).filter((m): m is StoredMedia => !!m);
  for (const acc of db.accounts.filter(a => accountIds.includes(a.id))) {
    const p = providers[acc.platform];
    if (!p) continue;
    if (p.requiresMedia && files.length === 0) return `${p.name} posts need an image or video.`;
    if (files.length > p.maxMedia) return `${p.name} allows at most ${p.maxMedia} attachment${p.maxMedia === 1 ? '' : 's'}.`;
    const bad = files.find(f => !p.mediaMimes.includes(f.mime));
    if (bad) return p.mediaMimes.length ? `${p.name} can't post ${bad.originalName} (${bad.mime}). Supported: ${p.mediaMimes.join(', ')}.` : `${p.name} is text-only for now.`;
  }
  return null;
}

const platformsOf = (accountIds: string[]) =>
  [...new Set(data().accounts.filter(a => accountIds.includes(a.id)).map(a => a.platform))];

app.get('/api/posts', (_req, res) => res.json(data().posts));

const DIRECT = 'You can save drafts and submit posts for approval, but an editor has to schedule or publish.';

app.post('/api/posts', async (req, res) => {
  const user = userFrom(res);
  const body = req.body ?? {};
  const action = body.action;
  if (!['draft', 'submit', 'schedule', 'publish'].includes(action)) return res.status(400).json({ error: 'Invalid action' });
  if (!can.draft(user.role)) return res.status(403).json({ error: 'Viewers cannot create posts' });
  if ((action === 'schedule' || action === 'publish') && !can.publishDirectly(user.role)) return res.status(403).json({ error: DIRECT });

  const parsed = parseFields({ mediaIds: [], categoryId: null, evergreen: null, accounts: [], ...body });
  if ('error' in parsed) return res.status(400).json({ error: parsed.error });
  const f = parsed.fields as PostFields;
  if (action !== 'draft' && f.accounts.length === 0) return res.status(400).json({ error: 'Select at least one connected account' });
  if (action !== 'draft') {
    const problem = mediaProblem(f.accounts, f.mediaIds);
    if (problem) return res.status(400).json({ error: problem });
  }

  let scheduledAt: string | null = null;
  if (action === 'schedule' || (action === 'submit' && body.scheduledAt)) {
    const s = parseSchedule(body.scheduledAt);
    if ('error' in s) return res.status(400).json({ error: s.error });
    scheduledAt = s.at;
  }

  const now = new Date().toISOString();
  const post: StoredPost = {
    id: crypto.randomUUID(),
    ...f,
    platforms: platformsOf(f.accounts),
    scheduledAt,
    publishedAt: null,
    status: action === 'draft' ? 'draft' : action === 'submit' ? 'pending_approval' : 'scheduled',
    recycledAt: null,
    recycledFrom: null,
    results: [],
    createdAt: now,
    createdBy: user.id,
    approval: action === 'submit' ? { requestedBy: user.id, requestedAt: now, decision: null, decidedBy: null, decidedAt: null, note: null } : null,
  };
  data().posts.push(post);
  save();
  if (action === 'publish') await publishPost(post);
  res.status(201).json(post);
});

// Edit a post that has not been published yet (also used by calendar drag-and-drop to reschedule).
app.patch('/api/posts/:id', async (req, res) => {
  const user = userFrom(res);
  const post = data().posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'Not found' });
  if (post.status === 'published' || post.status === 'publishing') return res.status(409).json({ error: 'Published posts cannot be edited' });
  if (post.status === 'pending_approval') return res.status(409).json({ error: 'This post is waiting for approval. Withdraw it to edit.' });

  const body = req.body ?? {};
  const direct = can.publishDirectly(user.role);
  if (!direct) {
    // Contributors may only work on their own drafts, and only save or submit them.
    if (!can.draft(user.role) || post.createdBy !== user.id || post.status !== 'draft') {
      return res.status(403).json({ error: 'You can only edit your own drafts.' });
    }
    if (body.action === 'schedule' || body.action === 'publish' || (!body.action && 'scheduledAt' in body)) {
      return res.status(403).json({ error: DIRECT });
    }
  }
  if (body.action !== undefined && !['draft', 'submit', 'schedule', 'publish'].includes(body.action)) return res.status(400).json({ error: 'Invalid action' });

  const parsed = parseFields(body);
  if ('error' in parsed) return res.status(400).json({ error: parsed.error });

  // Work on a copy so a rejected edit never leaves the stored post half-updated.
  const next: StoredPost = { ...post, ...parsed.fields };
  if (parsed.fields.accounts) next.platforms = platformsOf(next.accounts);

  if (body.action === 'draft') {
    next.status = 'draft';
    next.scheduledAt = null;
  } else if (body.action === 'submit') {
    if (body.scheduledAt) {
      const s = parseSchedule(body.scheduledAt);
      if ('error' in s) return res.status(400).json({ error: s.error });
      next.scheduledAt = s.at;
    } else next.scheduledAt = null;
    next.status = 'pending_approval';
    next.approval = { requestedBy: user.id, requestedAt: new Date().toISOString(), decision: null, decidedBy: null, decidedAt: null, note: null };
  } else if (body.action === 'publish') {
    next.status = 'scheduled';
    next.scheduledAt = null;
  } else if (body.action === 'schedule' || 'scheduledAt' in body) {
    const s = parseSchedule(body.scheduledAt);
    if ('error' in s) return res.status(400).json({ error: s.error });
    next.scheduledAt = s.at;
    next.status = 'scheduled';
  }
  if (next.status !== 'draft' && next.accounts.length === 0) return res.status(400).json({ error: 'Select at least one connected account' });
  if (next.status !== 'draft') {
    const problem = mediaProblem(next.accounts, next.mediaIds);
    if (problem) return res.status(400).json({ error: problem });
  }

  Object.assign(post, next);
  save();
  if (body.action === 'publish') await publishPost(post);
  res.json(post);
});

// ---- Approval workflow ---------------------------------------------------------
const pendingPost = (id: string) => {
  const p = data().posts.find(x => x.id === id);
  return p?.status === 'pending_approval' && p.approval ? p : null;
};

app.get('/api/approvals', requireRole(can.approve), (_req, res) => {
  res.json(data().posts.filter(p => p.status === 'pending_approval'));
});

app.post('/api/posts/:id/approve', requireRole(can.approve), (req, res) => {
  const post = pendingPost(String(req.params.id));
  if (!post) return res.status(409).json({ error: 'This post is not waiting for approval' });
  let at: string;
  if (req.body?.scheduledAt) {
    const s = parseSchedule(req.body.scheduledAt);
    if ('error' in s) return res.status(400).json({ error: s.error });
    at = s.at;
  } else {
    // Keep the requested time if it is still in the future; otherwise publish as soon as possible.
    at = post.scheduledAt && new Date(post.scheduledAt).getTime() > Date.now() ? post.scheduledAt : new Date().toISOString();
  }
  post.scheduledAt = at;
  post.status = 'scheduled';
  post.approval = { ...post.approval!, decision: 'approved', decidedBy: userFrom(res).id, decidedAt: new Date().toISOString(), note: req.body?.note ? String(req.body.note).slice(0, 500) : null };
  save();
  res.json(post);
});

app.post('/api/posts/:id/reject', requireRole(can.approve), (req, res) => {
  const post = pendingPost(String(req.params.id));
  if (!post) return res.status(409).json({ error: 'This post is not waiting for approval' });
  const note = String(req.body?.note ?? '').trim().slice(0, 500);
  if (!note) return res.status(400).json({ error: 'Add a note so the author knows what to change' });
  post.status = 'draft';
  post.scheduledAt = null;
  post.approval = { ...post.approval!, decision: 'rejected', decidedBy: userFrom(res).id, decidedAt: new Date().toISOString(), note };
  save();
  res.json(post);
});

app.post('/api/posts/:id/withdraw', (req, res) => {
  const user = userFrom(res);
  const post = pendingPost(req.params.id);
  if (!post) return res.status(409).json({ error: 'This post is not waiting for approval' });
  if (post.createdBy !== user.id && !can.approve(user.role)) return res.status(403).json({ error: 'Only the author or an editor can withdraw this post' });
  post.status = 'draft';
  post.scheduledAt = null;
  post.approval = null;
  save();
  res.json(post);
});

app.post('/api/posts/:id/retry', requireRole(can.publishDirectly), async (req, res) => {
  const post = data().posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'Not found' });
  if (post.status !== 'failed') return res.status(409).json({ error: 'Only failed posts can be retried' });
  await publishPost(post);
  res.json(post);
});

app.delete('/api/posts/:id', (req, res) => {
  const user = userFrom(res);
  const db = data();
  const idx = db.posts.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const post = db.posts[idx];
  const own = post.createdBy === user.id && post.status === 'draft';
  if (!can.publishDirectly(user.role) && !own) return res.status(403).json({ error: 'You can only delete your own drafts.' });
  db.posts.splice(idx, 1);
  save();
  res.status(204).end();
});

// Loopback by default; set HOST=0.0.0.0 only behind HTTPS (and set APP_URL to your https address).
app.listen(config.port, config.host, () => {
  console.log(`ScheduleX API on http://${config.host}:${config.port}`);
  for (const id of allPlatforms) {
    const p = providers[id];
    if (p) console.log(`  ${p.name}: ${p.configured() ? 'configured' : `not configured (set ${p.envVars.join(', ')})`}`);
  }
  startScheduler();
});
