import { SelectableAccount, AnalyticsReport, Category, InboxAccount, InboxItem, Invite, MediaItem, Platform, Post, ProviderInfo, Role, Slot, SocialAccount, User } from './types';

/** Called when any request comes back 401 so the app can drop back to the sign-in screen. */
let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: (() => void) | null) => { onUnauthorized = fn; };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (res.status === 401 && !path.startsWith('/api/session')) onUnauthorized?.();
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export interface PostInput {
  content: string;
  accounts: string[];
  mediaIds: string[];
  categoryId: string | null;
  evergreen: { everyDays: number } | null;
}

export interface CreatePostInput extends PostInput {
  action: 'draft' | 'submit' | 'schedule' | 'publish';
  scheduledAt?: string;
}

export const api = {
  session: () => request<{ user: User | null; needsSetup: boolean }>('/api/session'),
  signup: (b: { name: string; email: string; password: string }) => request<{ user: User }>('/api/session/signup', json('POST', b)),
  login: (b: { email: string; password: string }) => request<{ user: User }>('/api/session/login', json('POST', b)),
  logout: () => request<void>('/api/session/logout', { method: 'POST' }),
  inviteInfo: (token: string) => request<{ role: Role }>(`/api/session/invite/${token}`),
  acceptInvite: (b: { token: string; name: string; email: string; password: string }) => request<{ user: User }>('/api/session/accept-invite', json('POST', b)),

  members: () => request<User[]>('/api/members'),
  setRole: (id: string, role: Role) => request<User>(`/api/members/${id}`, json('PATCH', { role })),
  removeMember: (id: string) => request<void>(`/api/members/${id}`, { method: 'DELETE' }),
  invites: () => request<Invite[]>('/api/invites'),
  createInvite: (role: Role) => request<Invite & { url: string }>('/api/invites', json('POST', { role })),
  deleteInvite: (id: string) => request<void>(`/api/invites/${id}`, { method: 'DELETE' }),

  analytics: (days: number) => request<AnalyticsReport>(`/api/analytics?days=${days}&tz=${new Date().getTimezoneOffset()}`),
  refreshAnalytics: (days: number) => request<AnalyticsReport>(`/api/analytics/refresh?days=${days}&tz=${new Date().getTimezoneOffset()}`, { method: 'POST' }),
  inbox: () => request<{ items: InboxItem[]; accounts: InboxAccount[] }>('/api/inbox'),
  refreshInbox: () => request<{ ok: true }>('/api/inbox/refresh', { method: 'POST' }),
  markRead: (id: string, read: boolean) => request<InboxItem>(`/api/inbox/${id}/read`, json('POST', { read })),
  replyTo: (id: string, text: string) => request<InboxItem>(`/api/inbox/${id}/reply`, json('POST', { text })),

  saveCredentials: (platform: Platform, values: Record<string, string>) => request<ProviderInfo>(`/api/integrations/${platform}`, json('PUT', { values })),
  clearCredentials: (platform: Platform) => request<ProviderInfo>(`/api/integrations/${platform}`, { method: 'DELETE' }),
  selection: (id: string) => request<{ platform: Platform; accounts: SelectableAccount[] }>(`/api/connect/${id}`),
  confirmSelection: (id: string, externalIds: string[]) => request<{ platform: Platform; count: number }>(`/api/connect/${id}/confirm`, json('POST', { externalIds })),
  cancelSelection: (id: string) => request<void>(`/api/connect/${id}`, { method: 'DELETE' }),

  approvePost: (id: string, scheduledAt?: string) => request<Post>(`/api/posts/${id}/approve`, json('POST', { scheduledAt })),
  rejectPost: (id: string, note: string) => request<Post>(`/api/posts/${id}/reject`, json('POST', { note })),
  withdrawPost: (id: string) => request<Post>(`/api/posts/${id}/withdraw`, { method: 'POST' }),

  providers: () => request<ProviderInfo[]>('/api/providers'),
  accounts: () => request<SocialAccount[]>('/api/accounts'),
  disconnectAccount: (id: string) => request<void>(`/api/accounts/${id}`, { method: 'DELETE' }),

  posts: () => request<Post[]>('/api/posts'),
  createPost: (input: CreatePostInput) => request<Post>('/api/posts', json('POST', input)),
  updatePost: (id: string, patch: Partial<PostInput> & { action?: 'draft' | 'submit' | 'schedule' | 'publish'; scheduledAt?: string }) =>
    request<Post>(`/api/posts/${id}`, json('PATCH', patch)),
  retryPost: (id: string) => request<Post>(`/api/posts/${id}/retry`, { method: 'POST' }),
  deletePost: (id: string) => request<void>(`/api/posts/${id}`, { method: 'DELETE' }),

  media: () => request<MediaItem[]>('/api/media'),
  uploadMedia: (file: File) =>
    request<MediaItem>('/api/media', {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-filename': encodeURIComponent(file.name) },
      body: file,
    }),
  deleteMedia: (id: string) => request<void>(`/api/media/${id}`, { method: 'DELETE' }),

  categories: () => request<Category[]>('/api/categories'),
  createCategory: (name: string, color: string) => request<Category>('/api/categories', json('POST', { name, color })),
  deleteCategory: (id: string) => request<void>(`/api/categories/${id}`, { method: 'DELETE' }),

  slots: () => request<Slot[]>('/api/slots'),
  saveSlots: (slots: { day: number; time: string }[]) => request<Slot[]>('/api/slots', json('PUT', { slots })),
};
