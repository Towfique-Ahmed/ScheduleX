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
}

export type PostStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed';

export interface PublishResult {
  accountId: string;
  status: 'published' | 'failed';
  externalId?: string;
  url?: string;
  error?: string;
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
}

interface Db {
  accounts: StoredAccount[];
  posts: StoredPost[];
  media: StoredMedia[];
  categories: Category[];
  slots: Slot[];
}

const file = path.join(config.dataDir, 'db.json');
let db: Db = { accounts: [], posts: [], media: [], categories: [], slots: [] };

if (fs.existsSync(file)) db = { ...db, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
for (const p of db.posts) {
  p.mediaIds ??= [];
  p.categoryId ??= null;
  p.evergreen ??= null;
  p.recycledAt ??= null;
  p.recycledFrom ??= null;
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
