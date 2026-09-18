import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.ts';

export type Platform = 'twitter' | 'facebook' | 'instagram' | 'linkedin' | 'tiktok' | 'pinterest';

export interface StoredAccount {
  id: string;
  platform: Platform;
  externalId: string;
  username: string;
  displayName: string;
  avatar: string;
  accessToken: string; // encrypted
  refreshToken: string | null; // encrypted
  expiresAt: string | null;
  needsReconnect: boolean;
  connectedAt: string;
  metricsError?: string | null;
  metricsAt?: string | null;
  inboxError?: string | null;
}

export type PostStatus = 'draft' | 'pending_approval' | 'scheduled' | 'publishing' | 'published' | 'failed';

export type Role = 'owner' | 'admin' | 'editor' | 'contributor' | 'viewer';

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string; // scrypt: salt.hash (base64)
  role: Role;
  createdAt: string;
}

export interface Session {
  tokenHash: string;
  userId: string;
  expiresAt: string;
}

export interface Invite {
  id: string;
  tokenHash: string;
  role: Role;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
}

export interface Approval {
  requestedBy: string;
  requestedAt: string;
  decision: 'approved' | 'rejected' | null;
  decidedBy: string | null;
  decidedAt: string | null;
  note: string | null;
}

export interface PublishResult {
  accountId: string;
  status: 'published' | 'failed';
  externalId?: string;
  url?: string;
  error?: string;
}

export interface Snapshot {
  accountId: string;
  /** yyyy-mm-dd (UTC). One snapshot per account per day. */
  day: string;
  followers?: number;
  impressions?: number;
  engagements?: number;
  clicks?: number;
}

export interface InboxItem {
  id: string;
  accountId: string;
  externalId: string;
  author: string;
  text: string;
  at: string;
  url?: string;
  context?: string;
  read: boolean;
  reply: { text: string; by: string; at: string } | null;
}

export interface StoredMedia {
  id: string;
  filename: string; // file name inside server/data/media
  originalName: string;
  mime: string;
  size: number;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  color: string;
}

/** Weekly posting slot. day: 0 = Sunday. time: "HH:MM" in the browser's local time zone. */
export interface Slot {
  id: string;
  day: number;
  time: string;
}

export interface StoredPost {
  id: string;
  content: string;
  accounts: string[];
  platforms: Platform[];
  scheduledAt: string | null;
  publishedAt: string | null;
  status: PostStatus;
  mediaIds: string[];
  categoryId: string | null;
  /** When set, the post is re-queued this many days after it publishes. */
  evergreen: { everyDays: number } | null;
  recycledAt: string | null;
  recycledFrom: string | null;
  results: PublishResult[];
  createdAt: string;
  createdBy: string | null;
  approval: Approval | null;
}

interface Db {
  accounts: StoredAccount[];
  posts: StoredPost[];
  media: StoredMedia[];
  categories: Category[];
  slots: Slot[];
  users: User[];
  sessions: Session[];
  invites: Invite[];
  snapshots: Snapshot[];
  inbox: InboxItem[];
}

const file = path.join(config.dataDir, 'db.json');
let db: Db = { accounts: [], posts: [], media: [], categories: [], slots: [], users: [], sessions: [], invites: [], snapshots: [], inbox: [] };

if (fs.existsSync(file)) db = { ...db, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
for (const p of db.posts) {
  p.mediaIds ??= [];
  p.categoryId ??= null;
  p.evergreen ??= null;
  p.recycledAt ??= null;
  p.recycledFrom ??= null;
  p.createdBy ??= null;
  p.approval ??= null;
}

// Anything left mid-publish by a crash is retried rather than stuck forever.
for (const p of db.posts) if (p.status === 'publishing') p.status = 'scheduled';

export function save() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

export const data = () => db;

export const mediaDir = path.join(config.dataDir, 'media');
