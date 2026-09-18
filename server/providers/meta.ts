import fs from 'node:fs';
import { config } from '../config.ts';
import { ConnectedAccount, LocalMedia, Provider, ProviderError, readJson } from './types.ts';

// Facebook Pages and Instagram professional accounts share one Meta app and one login.
// Both are reached with a *Page* access token, which never expires when derived from a long-lived user token.

const appId = () => process.env.META_APP_ID ?? '';
const appSecret = () => process.env.META_APP_SECRET ?? '';
const graph = (path: string) => `https://graph.facebook.com/${config.graphVersion}${path}`;

/** Graph errors: code 190 means the token is invalid/expired, so the user must reconnect. */
function graphError(res: Response, json: any, what: string): ProviderError {
  const e = json?.error;
  const auth = res.status === 401 || e?.code === 190 || e?.type === 'OAuthException' && [102, 190].includes(e?.code);
  return new ProviderError(`${what}: ${e?.message ?? res.status}`, auth);
}

async function graphJson(url: string, init: RequestInit | undefined, what: string) {
  const res = await fetch(url, init);
  const json = await readJson(res);
  if (!res.ok || json.error) throw graphError(res, json, what);
  return json;
}

async function exchange(code: string, redirectUri: string) {
  const short = await graphJson(
    graph('/oauth/access_token?' + new URLSearchParams({ client_id: appId(), client_secret: appSecret(), redirect_uri: redirectUri, code })),
    undefined, 'Meta token request');
  const long = await graphJson(
    graph('/oauth/access_token?' + new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: appId(), client_secret: appSecret(), fb_exchange_token: short.access_token })),
    undefined, 'Meta long-lived token request');
  return { accessToken: long.access_token as string, expiresIn: (long.expires_in as number | undefined) ?? null };
}

interface PageInfo {
  id: string;
  name: string;
  access_token: string;
  picture?: { data?: { url?: string } };
  instagram_business_account?: { id: string; username?: string; name?: string; profile_picture_url?: string };
}

async function listPages(userToken: string): Promise<PageInfo[]> {
  const pages: PageInfo[] = [];
  let url: string | undefined = graph('/me/accounts?' + new URLSearchParams({
    fields: 'id,name,access_token,picture{url},instagram_business_account{id,username,name,profile_picture_url}',
    limit: '100', access_token: userToken,
  }));
  for (let i = 0; i < 5 && url; i++) {
    const json: any = await graphJson(url, undefined, 'Could not list Facebook Pages');
    pages.push(...(json.data ?? []));
    url = json.paging?.next;
  }
  return pages;
}

const baseAuth = {
  usesPkce: false,
  envVars: ['META_APP_ID', 'META_APP_SECRET'],
  configured: () => !!appId() && !!appSecret(),
  profile: async () => { throw new ProviderError('Meta accounts are listed via accounts()'); },
};

const dialog = (scopes: string[]) => ({ state, redirectUri }: { state: string; redirectUri: string }) =>
  `https://www.facebook.com/${config.graphVersion}/dialog/oauth?` +
  new URLSearchParams({ client_id: appId(), redirect_uri: redirectUri, state, response_type: 'code', scope: scopes.join(',') });

// ---- Facebook Pages -----------------------------------------------------------------
async function uploadPhoto(pageId: string, token: string, m: LocalMedia, fields: Record<string, string>) {
  const form = new FormData();
  form.append('source', new Blob([fs.readFileSync(m.path)], { type: m.mime }), m.name);
  form.append('access_token', token);
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return graphJson(graph(`/${pageId}/photos`), { method: 'POST', body: form }, 'Facebook photo upload');
}

export const facebook: Provider = {
  ...baseAuth,
  id: 'facebook',
  name: 'Facebook',
  mediaMimes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  maxMedia: 10,
  authUrl: dialog(['pages_show_list', 'pages_manage_posts', 'pages_read_engagement', 'pages_manage_engagement', 'read_insights']),
  exchange: ({ code, redirectUri }) => exchange(code, redirectUri),

  accounts: async tokens => {
    const pages = await listPages(tokens.accessToken);
    if (pages.length === 0) throw new ProviderError('No Facebook Pages found. You must be an admin of a Page to connect it.');
    return pages.map<ConnectedAccount>(p => ({
      accessToken: p.access_token,
      expiresIn: null,
      profile: { externalId: p.id, username: p.name, displayName: p.name, avatar: p.picture?.data?.url ?? '' },
    }));
  },

  publish: async ({ accessToken, externalId, content, media }) => {
    let json: any;
    if (media.length === 0) {
      json = await graphJson(graph(`/${externalId}/feed`), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content, access_token: accessToken }),
      }, 'Facebook post');
    } else if (media.length === 1) {
      json = await uploadPhoto(externalId, accessToken, media[0], { caption: content, published: 'true' });
    } else {
      // Multi-photo posts: upload each unpublished, then attach them all to one feed post.
      const ids: string[] = [];
      for (const m of media) ids.push((await uploadPhoto(externalId, accessToken, m, { published: 'false' })).id);
      json = await graphJson(graph(`/${externalId}/feed`), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content, access_token: accessToken, attached_media: ids.map(id => ({ media_fbid: id })) }),
      }, 'Facebook post');
    }
    const id = String(json.post_id ?? json.id);
    return { externalId: id, url: `https://www.facebook.com/${id}` };
  },
};

// ---- Instagram (professional account linked to a Page) ------------------------------------
function requirePublicUrl(m: LocalMedia): string {
  if (!m.publicUrl || /^https?:\/\/(localhost|127\.|0\.0\.0\.0)/.test(m.publicUrl) || !m.publicUrl.startsWith('https://')) {
    throw new ProviderError('Instagram downloads images from a public https URL. Set PUBLIC_URL to your server’s public address (e.g. an ngrok URL).');
  }
  return m.publicUrl;
}

async function waitForContainer(id: string, token: string) {
  for (let i = 0; i < 10; i++) {
    const s = await graphJson(graph(`/${id}?fields=status_code&access_token=${encodeURIComponent(token)}`), undefined, 'Instagram media status');
    if (s.status_code === 'FINISHED') return;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new ProviderError('Instagram could not process the image');
    await new Promise(r => setTimeout(r, 1500));
  }
  throw new ProviderError('Instagram took too long to process the image');
}

const post = (path: string, body: Record<string, unknown>, what: string) =>
  graphJson(graph(path), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, what);

export const instagram: Provider = {
  ...baseAuth,
  id: 'instagram',
  name: 'Instagram',
  mediaMimes: ['image/jpeg'], // Instagram feed publishing accepts JPEG only
  maxMedia: 10,
  requiresMedia: true,
  authUrl: dialog(['pages_show_list', 'instagram_basic', 'instagram_content_publish', 'instagram_manage_comments', 'pages_read_engagement', 'instagram_manage_insights']),
  exchange: ({ code, redirectUri }) => exchange(code, redirectUri),

  accounts: async tokens => {
    const linked = (await listPages(tokens.accessToken)).filter(p => p.instagram_business_account);
    if (linked.length === 0) {
      throw new ProviderError('No Instagram professional account found. Convert it to a Business or Creator account and link it to a Facebook Page first.');
    }
    return linked.map<ConnectedAccount>(p => {
      const ig = p.instagram_business_account!;
      return {
        accessToken: p.access_token,
        expiresIn: null,
        profile: { externalId: ig.id, username: '@' + (ig.username ?? ig.id), displayName: ig.name ?? ig.username ?? 'Instagram', avatar: ig.profile_picture_url ?? '' },
      };
    });
  },

  publish: async ({ accessToken, externalId, content, media }) => {
    const urls = media.map(requirePublicUrl);
    let creationId: string;
    if (urls.length === 1) {
      creationId = (await post(`/${externalId}/media`, { image_url: urls[0], caption: content, access_token: accessToken }, 'Instagram media')).id;
    } else {
      const children: string[] = [];
      for (const url of urls) children.push((await post(`/${externalId}/media`, { image_url: url, is_carousel_item: true, access_token: accessToken }, 'Instagram carousel item')).id);
      creationId = (await post(`/${externalId}/media`, { media_type: 'CAROUSEL', children, caption: content, access_token: accessToken }, 'Instagram carousel')).id;
    }
    await waitForContainer(creationId, accessToken);
    const published = await post(`/${externalId}/media_publish`, { creation_id: creationId, access_token: accessToken }, 'Instagram publish');
    let url: string | undefined;
    try {
      url = (await graphJson(graph(`/${published.id}?fields=permalink&access_token=${encodeURIComponent(accessToken)}`), undefined, 'permalink')).permalink;
    } catch { /* the post is live even if the permalink lookup fails */ }
    return { externalId: String(published.id), url };
  },
};

// ---- Analytics & inbox ---------------------------------------------------------------
const gget = (path: string, token: string, what: string) =>
  graphJson(graph(`${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`), undefined, what);

/** Sums an Insights response's values; returns undefined if the metric isn't there. */
const insightTotal = (json: any, metric: string): number | undefined => {
  const row = (json.data ?? []).find((d: any) => d.name === metric);
  if (!row) return undefined;
  if (row.total_value) return row.total_value.value;
  return (row.values ?? []).reduce((n: number, v: any) => n + (typeof v.value === 'number' ? v.value : 0), 0);
};

facebook.metrics = async ({ accessToken, externalId }) => {
  const page = await gget(`/${externalId}?fields=followers_count,fan_count`, accessToken, 'Facebook Page');
  const out: import('./types.ts').Metrics = { followers: page.followers_count ?? page.fan_count };
  try {
    // Insights metric names change between Graph versions; failure just means followers-only.
    const ins = await gget(`/${externalId}/insights?metric=page_media_view,page_post_engagements&period=days_28`, accessToken, 'Facebook insights');
    out.impressions = insightTotal(ins, 'page_media_view');
    out.engagements = insightTotal(ins, 'page_post_engagements');
  } catch { /* followers only */ }
  return out;
};

instagram.metrics = async ({ accessToken, externalId }) => {
  const acct = await gget(`/${externalId}?fields=followers_count`, accessToken, 'Instagram account');
  const out: import('./types.ts').Metrics = { followers: acct.followers_count };
  try {
    const ins = await gget(`/${externalId}/insights?metric=views,accounts_engaged&metric_type=total_value&period=day`, accessToken, 'Instagram insights');
    out.impressions = insightTotal(ins, 'views');
    out.engagements = insightTotal(ins, 'accounts_engaged');
  } catch { /* followers only */ }
  return out;
};

facebook.inbox = async ({ accessToken, externalId }) => {
  const json = await gget(`/${externalId}/feed?fields=message,comments.limit(25){id,message,from,created_time,permalink_url}&limit=10`, accessToken, 'Facebook comments');
  const out: import('./types.ts').InboxEntry[] = [];
  for (const post of json.data ?? []) {
    for (const c of post.comments?.data ?? []) {
      if (c.from?.id === externalId) continue; // the Page's own replies
      out.push({ externalId: c.id, author: c.from?.name ?? 'Facebook user', text: c.message ?? '', at: c.created_time, url: c.permalink_url, context: post.message?.slice(0, 80) });
    }
  }
  return out;
};

instagram.inbox = async ({ accessToken, externalId }) => {
  const json = await gget(`/${externalId}/media?fields=caption,permalink,comments.limit(25){id,text,username,timestamp}&limit=10`, accessToken, 'Instagram comments');
  const out: import('./types.ts').InboxEntry[] = [];
  for (const media of json.data ?? []) {
    for (const c of media.comments?.data ?? []) {
      out.push({ externalId: c.id, author: '@' + (c.username ?? 'user'), text: c.text ?? '', at: c.timestamp, url: media.permalink, context: media.caption?.slice(0, 80) });
    }
  }
  return out;
};

facebook.reply = async ({ accessToken, itemExternalId, text }) => {
  await post(`/${itemExternalId}/comments`, { message: text, access_token: accessToken }, 'Facebook reply');
};
instagram.reply = async ({ accessToken, itemExternalId, text }) => {
  await post(`/${itemExternalId}/replies`, { message: text, access_token: accessToken }, 'Instagram reply');
};
