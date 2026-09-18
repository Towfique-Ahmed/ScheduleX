import crypto from 'node:crypto';
import fs from 'node:fs';
import { isDeadGrant, Provider, ProviderError, readJson } from './types.ts';

const key = () => process.env.TIKTOK_CLIENT_KEY ?? '';
const secret = () => process.env.TIKTOK_CLIENT_SECRET ?? '';
const API = 'https://open.tiktokapis.com/v2';

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch(`${API}/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_key: key(), client_secret: secret(), ...body }),
  });
  const json = await readJson(res);
  if (!res.ok || json.error) throw new ProviderError(`TikTok token request failed: ${json.error_description ?? json.error ?? res.status}`, isDeadGrant(res.status));
  return { accessToken: json.access_token as string, refreshToken: (json.refresh_token as string) ?? null, expiresIn: (json.expires_in as number) ?? null };
}

export const tiktok: Provider = {
  id: 'tiktok',
  name: 'TikTok',
  envVars: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
  usesPkce: true,
  configured: () => !!key() && !!secret(),
  mediaMimes: ['video/mp4'],
  maxMedia: 1,
  requiresMedia: true,

  // TikTok's PKCE challenge is the *hex* SHA-256 of the verifier (not base64url like other providers).
  authUrl: ({ state, verifier, redirectUri }) =>
    'https://www.tiktok.com/v2/auth/authorize/?' + new URLSearchParams({
      client_key: key(), scope: 'user.info.basic,user.info.stats,video.publish', response_type: 'code', redirect_uri: redirectUri, state,
      code_challenge: crypto.createHash('sha256').update(verifier).digest('hex'), code_challenge_method: 'S256',
    }),

  exchange: ({ code, verifier, redirectUri }) =>
    tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: verifier }),
  refresh: refreshToken => tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken }),

  profile: async accessToken => {
    const res = await fetch(`${API}/user/info/?fields=open_id,display_name,avatar_url,username`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const json = await readJson(res);
    const u = json.data?.user;
    if (!res.ok || !u) throw new ProviderError(`Could not load TikTok profile: ${json.error?.message ?? res.status}`);
    return { externalId: u.open_id, username: u.username ? '@' + u.username : u.display_name, displayName: u.display_name ?? 'TikTok', avatar: u.avatar_url ?? '' };
  },

  publish: async ({ accessToken, content, media }) => {
    const file = media[0];
    const bytes = fs.readFileSync(file.path);
    const size = bytes.length;
    // Unaudited TikTok apps may only post privately; set TIKTOK_PRIVACY=PUBLIC_TO_EVERYONE after your app passes audit.
    const privacy = process.env.TIKTOK_PRIVACY ?? 'SELF_ONLY';
    const init = await fetch(`${API}/post/publish/video/init/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({
        post_info: { title: content.slice(0, 2200), privacy_level: privacy },
        source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: size, total_chunk_count: 1 },
      }),
    });
    const json = await readJson(init);
    const code = json.error?.code;
    if (init.status === 401 || code === 'access_token_invalid') throw new ProviderError('TikTok rejected the access token', true);
    if (!init.ok || (code && code !== 'ok') || !json.data?.upload_url) throw new ProviderError(`TikTok: ${json.error?.message ?? init.status}`);
    const put = await fetch(json.data.upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': file.mime, 'Content-Length': String(size), 'Content-Range': `bytes 0-${size - 1}/${size}` },
      body: bytes,
    });
    if (!put.ok) throw new ProviderError(`TikTok video upload failed (${put.status})`);
    // TikTok processes the video asynchronously; the post appears in the account once it finishes.
    return { externalId: String(json.data.publish_id) };
  },
};

tiktok.metrics = async ({ accessToken }) => {
  const res = await fetch(`${API}/user/info/?fields=follower_count,likes_count`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const json = await readJson(res);
  if (res.status === 401) throw new ProviderError('TikTok rejected the access token', true);
  const u = json.data?.user;
  if (!res.ok || !u) throw new ProviderError(`TikTok stats: ${json.error?.message ?? res.status}`);
  return { followers: u.follower_count, engagements: u.likes_count };
};
