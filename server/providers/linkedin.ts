import { config } from '../config.ts';
import fs from 'node:fs';
import { LocalMedia, Provider, ProviderError, readJson } from './types.ts';

const clientId = () => process.env.LINKEDIN_CLIENT_ID ?? '';
const clientSecret = () => process.env.LINKEDIN_CLIENT_SECRET ?? '';

const restHeaders = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
  'Content-Type': 'application/json',
  'X-Restli-Protocol-Version': '2.0.0',
  'LinkedIn-Version': config.linkedinApiVersion,
});

// Two-step upload: ask LinkedIn for an upload URL + image URN, then PUT the bytes.
async function uploadImage(accessToken: string, ownerUrn: string, m: LocalMedia): Promise<string> {
  const init = await fetch('https://api.linkedin.com/rest/images?action=initializeUpload', {
    method: 'POST',
    headers: restHeaders(accessToken),
    body: JSON.stringify({ initializeUploadRequest: { owner: ownerUrn } }),
  });
  const json = await readJson(init);
  if (init.status === 401) throw new ProviderError('LinkedIn rejected the access token', true);
  if (!init.ok || !json.value?.uploadUrl) throw new ProviderError(`LinkedIn image init failed: ${json.message ?? init.status}`);
  const put = await fetch(json.value.uploadUrl, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': m.mime },
    body: fs.readFileSync(m.path),
  });
  if (!put.ok) throw new ProviderError(`LinkedIn image upload failed (${put.status})`);
  return json.value.image as string;
}

export const linkedin: Provider = {
  id: 'linkedin',
  name: 'LinkedIn',
  envVars: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
  usesPkce: false,
  mediaMimes: ['image/jpeg', 'image/png', 'image/gif'],
  maxMedia: 9,
  configured: () => !!clientId() && !!clientSecret(),

  authUrl: ({ state, redirectUri }) => {
    const q = new URLSearchParams({
      response_type: 'code',
      client_id: clientId(),
      redirect_uri: redirectUri,
      scope: 'openid profile w_member_social',
      state,
    });
    return `https://www.linkedin.com/oauth/v2/authorization?${q}`;
  },

  exchange: async ({ code, redirectUri }) => {
    const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId(),
        client_secret: clientSecret(),
      }),
    });
    const json = await readJson(res);
    if (!res.ok) throw new ProviderError(`LinkedIn token request failed: ${json.error_description ?? json.error ?? res.status}`, true);
    // Self-serve LinkedIn apps get no refresh token; the user reconnects when this expires (~60 days).
    return { accessToken: json.access_token, refreshToken: json.refresh_token ?? null, expiresIn: json.expires_in ?? null };
  },

  profile: async accessToken => {
    const res = await fetch('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } });
    const json = await readJson(res);
    if (!res.ok || !json.sub) throw new ProviderError(`Could not load LinkedIn profile: ${json.message ?? res.status}`);
    return {
      externalId: json.sub,
      username: json.name ?? json.sub,
      displayName: json.name ?? 'LinkedIn member',
      avatar: json.picture ?? '',
    };
  },

  publish: async ({ accessToken, externalId, content, media }) => {
    const author = `urn:li:person:${externalId}`;
    const images: string[] = [];
    for (const m of media) images.push(await uploadImage(accessToken, author, m));
    const mediaContent =
      images.length === 1 ? { content: { media: { id: images[0] } } }
      : images.length > 1 ? { content: { multiImage: { images: images.map(id => ({ id })) } } }
      : {};
    const res = await fetch('https://api.linkedin.com/rest/posts', {
      method: 'POST',
      headers: restHeaders(accessToken),
      body: JSON.stringify({
        ...mediaContent,
        author,
        commentary: content,
        visibility: 'PUBLIC',
        distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false,
      }),
    });
    if (res.status === 401) throw new ProviderError('LinkedIn rejected the access token', true);
    if (!res.ok) {
      const json = await readJson(res);
      throw new ProviderError(`LinkedIn: ${json.message ?? res.status}`);
    }
    const urn = res.headers.get('x-restli-id') ?? '';
    return { externalId: urn, url: urn ? `https://www.linkedin.com/feed/update/${urn}` : undefined };
  },
};

linkedin.metricsNote = 'LinkedIn does not offer follower or post analytics for personal profiles to ordinary apps (it requires Marketing Developer Platform partner access).';
