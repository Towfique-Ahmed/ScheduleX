import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import { config } from './config.ts';
import { atLeast, canAssign, can, ROLES } from './roles.ts';
import { data, save, Role, User } from './store.ts';

const SESSION_DAYS = 14;
const COOKIE = 'sx_session';
const secure = config.appUrl.startsWith('https://');

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

// ---- Passwords ------------------------------------------------------------------
// scrypt runs on the libuv thread pool, so hashing never blocks the event loop (and the scheduler with it).
const scrypt = (password: string, salt: Buffer, len: number) =>
  new Promise<Buffer>((resolve, reject) => crypto.scrypt(password, salt, len, (err, key) => (err ? reject(err) : resolve(key))));

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  return `${salt.toString('base64')}.${(await scrypt(password, salt, 64)).toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split('.').map(p => Buffer.from(p, 'base64'));
  return crypto.timingSafeEqual(hash, await scrypt(password, salt, hash.length));
}

// Verified against when the email is unknown, so "no such user" costs exactly one scrypt like a real attempt.
const DUMMY_HASH = (() => {
  const salt = crypto.randomBytes(16);
  return `${salt.toString('base64')}.${crypto.scryptSync('dummy-password', salt, 64).toString('base64')}`;
})();

const validPassword = (p: unknown): p is string => typeof p === 'string' && p.length >= 10 && p.length <= 200;
const validEmail = (e: unknown): e is string => typeof e === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && e.length <= 200;
const cleanName = (n: unknown) => String(n ?? '').trim().slice(0, 80);

// ---- Sessions ---------------------------------------------------------------------
function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function startSession(res: Response, userId: string) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  const db = data();
  db.sessions = db.sessions.filter(s => new Date(s.expiresAt) > new Date());
  db.sessions.push({ tokenHash: sha256(token), userId, expiresAt: expires.toISOString() });
  save();
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure ? '; Secure' : ''}`);
}

function endSession(req: Request, res: Response) {
  const token = readCookie(req, COOKIE);
  if (token) {
    data().sessions = data().sessions.filter(s => s.tokenHash !== sha256(token));
    save();
  }
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`);
}

export const userFrom = (res: Response): User => res.locals.user;

export const publicUser = (u: User) => ({ id: u.id, email: u.email, name: u.name, role: u.role, createdAt: u.createdAt });

/** Loads the session user (if any) into res.locals.user. */
export function sessionMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = readCookie(req, COOKIE);
  if (token) {
    const hash = sha256(token);
    const session = data().sessions.find(s => s.tokenHash === hash);
    if (session && new Date(session.expiresAt) > new Date()) {
      res.locals.user = data().users.find(u => u.id === session.userId);
    }
  }
  next();
}

/**
 * Blocks cross-site requests that change state. Browsers always send Origin on cross-origin
 * POST/PUT/PATCH/DELETE, so a mismatch means another website is driving the user's browser.
 */
export function originCheck(req: Request, res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (origin && origin !== new URL(config.appUrl).origin) {
    return res.status(403).json({ error: `Requests must come from ${config.appUrl}. Open the app at that address.` });
  }
  next();
}

export function requireUser(req: Request, res: Response, next: NextFunction) {
  if (!res.locals.user) return res.status(401).json({ error: 'Sign in required' });
  next();
}

export const requireRole = (check: (r: Role) => boolean, message = 'You do not have permission to do that') =>
  (_req: Request, res: Response, next: NextFunction) => {
    if (!check(userFrom(res).role)) return res.status(403).json({ error: message });
    next();
  };

// ---- Login throttling ---------------------------------------------------------------
const failures = new Map<string, { count: number; until: number }>();
const WINDOW_MS = 15 * 60_000;
const LIMITS = { perEmail: 8, perIp: 30 };

const throttleKeys = (ip: string | undefined, email: unknown) => [
  { key: `ip|${ip}`, limit: LIMITS.perIp },
  { key: `ip-email|${ip}|${String(email).toLowerCase()}`, limit: LIMITS.perEmail },
];
function throttled(keys: ReturnType<typeof throttleKeys>) {
  return keys.some(({ key, limit }) => {
    const f = failures.get(key);
    return !!f && f.until > Date.now() && f.count >= limit;
  });
}
function noteFailure(keys: ReturnType<typeof throttleKeys>) {
  const now = Date.now();
  if (failures.size > 2000) for (const [k, v] of failures) if (v.until < now) failures.delete(k); // never grows without bound
  for (const { key } of keys) {
    const f = failures.get(key);
    if (!f || f.until < now) failures.set(key, { count: 1, until: now + WINDOW_MS });
    else f.count++;
  }
}

// ---- Routes -------------------------------------------------------------------------
export const authRouter = express.Router();

authRouter.get('/session', (_req, res) => {
  const user = res.locals.user as User | undefined;
  res.json({ user: user ? publicUser(user) : null, needsSetup: data().users.length === 0 });
});

authRouter.post('/session/signup', async (req, res) => {
  if (data().users.length > 0) return res.status(403).json({ error: 'Setup is already complete. Ask an admin for an invite.' });
  const { email, password } = req.body ?? {};
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ error: 'Name is required' });
  if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email' });
  if (!validPassword(password)) return res.status(400).json({ error: 'Password must be at least 10 characters' });
  const user: User = { id: crypto.randomUUID(), email: email.toLowerCase(), name, passwordHash: await hashPassword(password), role: 'owner', createdAt: new Date().toISOString() };
  data().users.push(user);
  save();
  startSession(res, user.id);
  res.status(201).json({ user: publicUser(user) });
});

authRouter.post('/session/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  const keys = throttleKeys(req.ip, email);
  if (throttled(keys)) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
  const user = validEmail(email) ? data().users.find(u => u.email === email.toLowerCase()) : undefined;
  const ok = await verifyPassword(String(password ?? '').slice(0, 200), user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    noteFailure(keys);
    return res.status(401).json({ error: 'Incorrect email or password' });
  }
  failures.delete(keys[1].key);
  startSession(res, user.id);
  res.json({ user: publicUser(user) });
});

authRouter.post('/session/logout', (req, res) => {
  endSession(req, res);
  res.status(204).end();
});

const findInvite = (token: string) => {
  const hash = sha256(token);
  const inv = data().invites.find(i => i.tokenHash === hash);
  return inv && !inv.usedAt && new Date(inv.expiresAt) > new Date() ? inv : undefined;
};

authRouter.get('/session/invite/:token', (req, res) => {
  const inv = findInvite(req.params.token);
  if (!inv) return res.status(404).json({ error: 'This invite link is invalid or has expired.' });
  res.json({ role: inv.role });
});

authRouter.post('/session/accept-invite', async (req, res) => {
  const { token, email, password } = req.body ?? {};
  const name = cleanName(req.body?.name);
  const inv = typeof token === 'string' ? findInvite(token) : undefined;
  if (!inv) return res.status(404).json({ error: 'This invite link is invalid or has expired.' });
  if (!name) return res.status(400).json({ error: 'Name is required' });
  if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email' });
  if (!validPassword(password)) return res.status(400).json({ error: 'Password must be at least 10 characters' });
  if (data().users.some(u => u.email === email.toLowerCase())) return res.status(409).json({ error: 'An account with that email already exists' });
  const user: User = { id: crypto.randomUUID(), email: email.toLowerCase(), name, passwordHash: await hashPassword(password), role: inv.role, createdAt: new Date().toISOString() };
  data().users.push(user);
  inv.usedAt = new Date().toISOString();
  save();
  startSession(res, user.id);
  res.status(201).json({ user: publicUser(user) });
});

// ---- Team management (authenticated) ---------------------------------------------------
export const teamRouter = express.Router();

// Everyone signed in can see who is on the team (for "created by" labels); emails are admin-only.
teamRouter.get('/members', (_req, res) => {
  const viewer = userFrom(res);
  res.json(data().users.map(u => (can.manageMembers(viewer.role) ? publicUser(u) : { id: u.id, name: u.name, role: u.role })));
});

teamRouter.patch('/members/:id', requireRole(can.manageMembers), (req, res) => {
  const actor = userFrom(res);
  const target = data().users.find(u => u.id === req.params.id);
  const role = req.body?.role as Role;
  if (!target) return res.status(404).json({ error: 'Not found' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (target.id === actor.id) return res.status(400).json({ error: "You can't change your own role" });
  if (!canAssign(actor.role, target.role) || !canAssign(actor.role, role)) return res.status(403).json({ error: 'You cannot assign that role' });
  target.role = role;
  save();
  res.json(publicUser(target));
});

teamRouter.delete('/members/:id', requireRole(can.manageMembers), (req, res) => {
  const actor = userFrom(res);
  const target = data().users.find(u => u.id === req.params.id);
  if (!target) return res.status(404).json({ error: 'Not found' });
  if (target.id === actor.id) return res.status(400).json({ error: "You can't remove yourself" });
  if (!canAssign(actor.role, target.role)) return res.status(403).json({ error: 'You cannot remove this member' });
  const db = data();
  db.users = db.users.filter(u => u.id !== target.id);
  db.sessions = db.sessions.filter(s => s.userId !== target.id);
  save();
  res.status(204).end();
});

teamRouter.get('/invites', requireRole(can.manageMembers), (_req, res) => {
  res.json(data().invites.filter(i => !i.usedAt && new Date(i.expiresAt) > new Date()).map(({ tokenHash, ...i }) => i));
});

teamRouter.post('/invites', requireRole(can.manageMembers), (req, res) => {
  const actor = userFrom(res);
  const role = req.body?.role as Role;
  if (!ROLES.includes(role) || !canAssign(actor.role, role)) return res.status(403).json({ error: 'You cannot invite someone with that role' });
  const token = crypto.randomBytes(24).toString('base64url');
  const invite = {
    id: crypto.randomUUID(), tokenHash: sha256(token), role, createdBy: actor.id,
    createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString(), usedAt: null,
  };
  data().invites.push(invite);
  save();
  // The raw token is only ever shown here; only its hash is stored.
  res.status(201).json({ id: invite.id, role, expiresAt: invite.expiresAt, url: `${config.appUrl}/invite/${token}` });
});

teamRouter.delete('/invites/:id', requireRole(can.manageMembers), (req, res) => {
  const db = data();
  db.invites = db.invites.filter(i => i.id !== req.params.id);
  save();
  res.status(204).end();
});

export { atLeast };
