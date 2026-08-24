export type Platform = 'twitter' | 'facebook' | 'instagram' | 'linkedin' | 'tiktok' | 'pinterest';

export interface SocialAccount {
  id: string;
  platform: Platform;
  username: string;
  displayName: string;
  avatar: string;
  connected: boolean;
}

export type PostStatus = 'draft' | 'scheduled' | 'published' | 'failed';

export interface Post {
  id: string;
  content: string;
  platforms: Platform[];
  scheduledAt: string | null;
  status: PostStatus;
  mediaUrls: string[];
  createdAt: string;
  accounts: string[];
}

export interface AnalyticsData {
  platform: Platform;
  followers: number;
  engagement: number;
  impressions: number;
  clicks: number;
  trend: number;
}
