import fs from 'node:fs';
import { ConnectedAccount, isDeadGrant, Provider, ProviderError, readJson } from './types.ts';

const id = () => process.env.PINTEREST_APP_ID ?? '';
const secret = () => process.env.PINTEREST_APP_SECRET ?? '';
// Apps with "trial" access must use the sandbox host until Pinterest upgrades them.
const api = () => (process.env.PINTEREST_API_BASE ?? 'https://api.pinterest.com/v5').replace(/\/$/, '');

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch(`${api()}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + Buffer.from(`${id()}:${secret()}`).toString('base64') },
    body: new URLSearchParams(body),
  });
  const json = await readJson(res);
  if (!res.ok) throw new ProviderError(`Pinterest token request failed: ${json.message ?? res.status}`, isDeadGrant(res.status));
  return { accessToken: json.access_token as string, refreshToken: (json.refresh_token as string) ?? null, expiresIn: (json.expires_in as number) ?? null };
}

const get = async (path: string, token: string, what: string) => {
  const res = await fetch(`${api()}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const json = await readJson(res);
  if (res.status === 401) throw new ProviderError('Pinterest rejected the access token', true);
  if (!res.ok) throw new ProviderError(`${what}: ${json.message ?? res.status}`);
  return json;
};

// Pinterest pins belong to a board, so each board is connected as its own account.
export const pinterest: Provider = {
  id: 'pinterest',
  name: 'Pinterest',
  envVars: ['PINTEREST_APP_ID', 'PINTEREST_APP_SECRET'],
  usesPkce: false,
  configured: () => !!id() && !!secret(),
  mediaMimes: ['image/jpeg', 'image/png', 'image/webp'],
  maxMedia: 1,
  requiresMedia: true,

  authUrl: ({ state, redirectUri }) =>
    'https://www.pinterest.com/oauth/?' + new URLSearchParams({
      client_id: id(), redirect_uri: redirectUri, response_type: 'code', state,
      scope: 'boards:read,pins:read,pins:write,user_accounts:read',
    }),

  exchange: ({ code, redirectUri }) => tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
  refresh: refreshToken => tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  profile: async () => { throw new ProviderError('Pinterest boards are listed via accounts()'); },

  accounts: async tokens => {
    const user = await get('/user_account', tokens.accessToken, 'Could not load Pinterest profile');
    const boards: { id: string; name: string }[] = [];
    let bookmark: string | undefined;
    for (let i = 0; i < 5; i++) {
      const page = await get(`/boards?page_size=100${bookmark ? `&bookmark=${encodeURIComponent(bookmark)}` : ''}`, tokens.accessToken, 'Could not list boards');
      boards.push(...(page.items ?? []));
      bookmark = page.bookmark ?? undefined;
      if (!bookmark) break;
    }
    if (boards.length === 0) throw new ProviderError('No boards found. Create a board on Pinterest first.');
    return boards.map<ConnectedAccount>(b => ({
      ...tokens,
      profile: { externalId: b.id, username: `${user.username}/${b.name}`, displayName: b.name, avatar: user.profile_image ?? '' },
    }));
  },

  publish: async ({ accessToken, externalId, content, media }) => {
    const m = media[0];
    const title = content.split('\n')[0].slice(0, 100);
    const res = await fetch(`${api()}/pins`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        board_id: externalId,
        title,
        description: content.slice(0, 500),
        media_source: { source_type: 'image_base64', content_type: m.mime, data: fs.readFileSync(m.path).toString('base64') },
      }),
    });
    const json = await readJson(res);
    if (res.status === 401) throw new ProviderError('Pinterest rejected the access token', true);
    if (!res.ok) throw new ProviderError(`Pinterest: ${json.message ?? res.status}`);
    return { externalId: String(json.id), url: `https://www.pinterest.com/pin/${json.id}/` };
  },
};

pinterest.metrics = async ({ accessToken }) => {
  const user = await get('/user_account', accessToken, 'Pinterest profile');
  const out: import('./types.ts').Metrics = { followers: user.follower_count };
  try {
    const end = new Date(), start = new Date(Date.now() - 28 * 86400_000);
    const day = (d: Date) => d.toISOString().slice(0, 10);
    const a = await get(`/user_account/analytics?start_date=${day(start)}&end_date=${day(end)}&metric_types=IMPRESSION,ENGAGEMENT,PIN_CLICK`, accessToken, 'Pinterest analytics');
    const s = a.all?.summary_metrics ?? {};
    out.impressions = s.IMPRESSION;
    out.engagements = s.ENGAGEMENT;
    out.clicks = s.PIN_CLICK;
  } catch { /* followers only */ }
  return out;
};
