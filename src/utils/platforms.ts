import { MediaItem, Platform, ProviderInfo } from '../types';

export const platformConfig: Record<Platform, { name: string; color: string; icon: string; maxChars: number }> = {
  twitter: { name: 'X (Twitter)', color: '#000000', icon: '𝕏', maxChars: 280 },
  facebook: { name: 'Facebook', color: '#1877F2', icon: 'f', maxChars: 63206 },
  instagram: { name: 'Instagram', color: '#E4405F', icon: '📷', maxChars: 2200 },
  linkedin: { name: 'LinkedIn', color: '#0A66C2', icon: 'in', maxChars: 3000 },
  tiktok: { name: 'TikTok', color: '#000000', icon: '♪', maxChars: 2200 },
  pinterest: { name: 'Pinterest', color: '#E60023', icon: 'P', maxChars: 500 },
};

export function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

/** Extra setup guidance shown in the "Set up" dialog, beyond the callback URL and env vars. */
export const SETUP_NOTES: Partial<Record<Platform, string[]>> = {
  twitter: ['Enable OAuth 2.0 with "Read and write" permissions. Free-tier apps have a low monthly post limit.'],
  linkedin: [
    'Create the app at linkedin.com/developers and associate it with a LinkedIn Company Page. The Page’s admin must verify the app.',
    'Set the app name and logo: they appear on LinkedIn’s consent screen (“<your app> would like to…”).',
    'Add the products “Sign In with LinkedIn using OpenID Connect” and “Share on LinkedIn”. To connect company Pages, also request the Community Management API (LinkedIn reviews it).',
  ],
  facebook: [
    'Create a Meta app (type: Business) and add the Facebook Login product.',
    'One login connects every Page you manage. Live use by other people requires Meta app review.',
  ],
  instagram: [
    'Uses the same Meta app as Facebook. The Instagram account must be a Business or Creator account linked to a Facebook Page.',
    'Instagram downloads images from a public https URL, so set PUBLIC_URL (e.g. an ngrok address) in .env. JPEG images only.',
  ],
  tiktok: [
    'Add the Content Posting API. TikTok requires an https redirect URI (use a tunnel like ngrok for local testing).',
    'Until TikTok audits your app, videos are posted as private (SELF_ONLY). MP4 only.',
  ],
  pinterest: [
    'Each board you own is connected as its own account. New apps start with trial access; set PINTEREST_API_BASE=https://api-sandbox.pinterest.com/v5 to test.',
  ],
};

/** Mirrors the server's compatibility check so problems show before the user hits Schedule. */
export function mediaProblem(platforms: Platform[], providers: ProviderInfo[], files: MediaItem[]): string | null {
  for (const platform of platforms) {
    const p = providers.find(x => x.platform === platform);
    if (!p) continue;
    const name = platformConfig[platform].name;
    if (p.requiresMedia && files.length === 0) return `${name} posts need an image or video.`;
    if (files.length > p.maxMedia) return `${name} allows at most ${p.maxMedia} attachment${p.maxMedia === 1 ? '' : 's'}.`;
    const bad = files.find(f => !p.mediaMimes.includes(f.mime));
    if (bad) return p.mediaMimes.length ? `${name} can't post ${bad.name} (${bad.mime.split('/')[1]}).` : `${name} is text-only for now.`;
  }
  return null;
}

/**
 * Plain-language meaning of OAuth scopes, so people know what they're approving before LinkedIn's
 * consent screen. Unknown scopes are shown as-is rather than hidden.
 */
export const SCOPE_TEXT: Record<string, string> = {
  openid: 'Confirm who you are',
  profile: 'Use your name and photo',
  email: 'Use your primary email address',
  w_member_social: 'Create posts on your behalf',
  r_member_social: 'Read your posts and their reporting data',
  r_member_profileAnalytics: 'Read your profile analytics',
  r_1st_connections_size: 'See how many connections you have',
  r_organization_admin: 'See which Pages you manage',
  rw_organization_admin: 'Manage your Pages and read their reporting',
  w_organization_social: 'Create posts on your Pages’ behalf',
  r_organization_social: 'Read your Pages’ posts, comments and reactions',
  w_organization_social_feed: 'Comment and react on your Pages’ posts',
  r_organization_followers: 'Read your Pages’ follower data',
  r_ads: 'See your advertising accounts',
  rw_ads: 'Manage your advertising accounts',
  r_ads_reporting: 'Read advertising reports',
};
