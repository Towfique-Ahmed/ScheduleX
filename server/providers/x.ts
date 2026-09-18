import fs from 'node:fs';
import { LocalMedia, Provider, ProviderError, readJson } from './types.ts';

const clientId = () => process.env.X_CLIENT_ID ?? '';
const clientSecret = () => process.env.X_CLIENT_SECRET ?? '';

// Confidential clients authenticate the token endpoint with HTTP Basic; public clients send client_id in the body.
function tokenRequest(body: Record<string, string>) {
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (clientSecret()) headers.Authorization = 'Basic ' + Buffer.from(`${clientId()}:${clientSecret()}`).toString('base64');
  else body.client_id = clientId();
  return fetch('https://api.x.com/2/oauth2/token', { method: 'POST', headers, body: new URLSearchParams(body) });
}

async function toTokens(res: Response) {
  const json = await readJson(res);
  if (!res.ok) throw new ProviderError(`X token request failed: ${json.error_description ?? json.error ?? res.status}`, true);
  return { accessToken: json.access_token, refreshToken: json.refresh_token ?? null, expiresIn: json.expires_in ?? null };
}

async function uploadImage(accessToken: string, m: LocalMedia): Promise<string> {
  const form = new FormData();
  form.append('media', new Blob([fs.readFileSync(m.path)], { type: m.mime }), m.name);
  form.append('media_category', 'tweet_image');
  const res = await fetch('https://api.x.com/2/media/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  const json = await readJson(res);
  if (res.status === 401) throw new ProviderError('X rejected the access token', true);
  if (res.status === 403 && /scope|permission/i.test(JSON.stringify(json))) {
    throw new ProviderError('X media upload needs the media.write scope — reconnect the account', true);
  }
  const id = json.data?.id ?? json.media_id_string;
  if (!res.ok || !id) throw new ProviderError(`X media upload failed: ${json.detail ?? json.title ?? res.status}`);
  return String(id);
}

export const x: Provider = {
  id: 'twitter',
  name: 'X (Twitter)',
  envVars: ['X_CLIENT_ID'],
  usesPkce: true,
  mediaMimes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  maxMedia: 4,
  configured: () => !!clientId(),

  authUrl: ({ state, challenge, redirectUri }) => {
    const q = new URLSearchParams({
      response_type: 'code',
      client_id: clientId(),
      redirect_uri: redirectUri,
      scope: 'tweet.read tweet.write users.read media.write offline.access',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    return `https://x.com/i/oauth2/authorize?${q}`;
  },

  exchange: async ({ code, verifier, redirectUri }) =>
    toTokens(await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: verifier })),

  refresh: async refreshToken => toTokens(await tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken })),

  profile: async accessToken => {
    const res = await fetch('https://api.x.com/2/users/me?user.fields=profile_image_url', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = await readJson(res);
    if (!res.ok || !json.data) throw new ProviderError(`Could not load X profile: ${json.detail ?? json.title ?? res.status}`);
    return {
      externalId: json.data.id,
      username: '@' + json.data.username,
      displayName: json.data.name,
      avatar: json.data.profile_image_url ?? '',
    };
  },

  publish: async ({ accessToken, username, content, media }) => {
    const mediaIds: string[] = [];
    for (const m of media) mediaIds.push(await uploadImage(accessToken, m));
    const res = await fetch('https://api.x.com/2/tweets', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: content, ...(mediaIds.length ? { media: { media_ids: mediaIds } } : {}) }),
    });
    const json = await readJson(res);
    if (res.status === 401) throw new ProviderError('X rejected the access token', true);
    if (!res.ok) throw new ProviderError(`X: ${json.detail ?? json.title ?? res.status}`);
    return { externalId: json.data.id, url: `https://x.com/${username.replace(/^@/, '')}/status/${json.data.id}` };
  },
};
