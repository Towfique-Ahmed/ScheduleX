export type Platform = 'twitter' | 'facebook' | 'instagram' | 'linkedin' | 'tiktok' | 'pinterest';

export interface SocialAccount {
  id: string;
  platform: Platform;
  username: string;
  displayName: string;
  avatar: string;
  variant?: string;
  /** False when the platform rejected or expired the token and the user must reconnect. */
  connected: boolean;
}

export interface ProviderInfo {
  platform: Platform;
  supported: boolean;
  configured: boolean;
  envVars: string[];
  redirectUri: string | null;
  credentials: { name: string; label: string; secret: boolean; required: boolean; set: boolean; source: 'env' | 'saved' | null }[];
  variants: { id: string; label: string; description: string; scopes?: string[] }[];
  mediaMimes: string[];
  maxMedia: number;
  requiresMedia: boolean;
}

export type PostStatus = 'draft' | 'pending_approval' | 'scheduled' | 'publishing' | 'published' | 'failed';

export type Role = 'owner' | 'admin' | 'editor' | 'contributor' | 'viewer';

export interface User {
  id: string;
  name: string;
  role: Role;
  email?: string;
}

export interface Approval {
  requestedBy: string;
  requestedAt: string;
  decision: 'approved' | 'rejected' | null;
  decidedBy: string | null;
  decidedAt: string | null;
  note: string | null;
}

export interface Invite {
  id: string;
  role: Role;
  expiresAt: string;
}

export interface PublishResult {
  accountId: string;
  status: 'published' | 'failed';
  externalId?: string;
  url?: string;
  error?: string;
}

export interface Post {
  id: string;
  content: string;
  platforms: Platform[];
  scheduledAt: string | null;
  publishedAt: string | null;
  status: PostStatus;
  mediaIds: string[];
  categoryId: string | null;
  evergreen: { everyDays: number } | null;
  recycledFrom: string | null;
  recycledAt: string | null;
  results: PublishResult[];
  createdAt: string;
  createdBy: string | null;
  approval: Approval | null;
  accounts: string[];
}

export interface AudienceRow {
  accountId: string;
  platform: Platform;
  displayName: string;
  username: string;
  supported: boolean;
  note: string | null;
  error: string | null;
  updatedAt: string | null;
  latest: { followers?: number; impressions?: number; engagements?: number; clicks?: number } | null;
  followerChange: number | null;
  series: { day: string; followers: number | null }[];
}

export interface AnalyticsReport {
  days: number;
  publishing: {
    published: number;
    failed: number;
    successRate: number | null;
    scheduled: number;
    drafts: number;
    pending: number;
    byDay: { date: string; published: number; failed: number }[];
    byPlatform: { platform: Platform; published: number; failed: number }[];
    byCategory: { categoryId: string; name: string; published: number }[];
  };
  audience: AudienceRow[];
}

export interface InboxItem {
  id: string;
  accountId: string;
  author: string;
  text: string;
  at: string;
  url?: string;
  context?: string;
  read: boolean;
  reply: { text: string; by: string; at: string } | null;
}

export interface InboxAccount {
  id: string;
  platform: Platform;
  displayName: string;
  error: string | null;
}

export interface MediaItem {
  id: string;
  name: string;
  mime: string;
  size: number;
  createdAt: string;
  url: string;
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

export interface SelectableAccount {
  externalId: string;
  username: string;
  displayName: string;
  avatar: string;
  alreadyConnected: boolean;
}
