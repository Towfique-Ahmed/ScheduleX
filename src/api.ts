import { Category, MediaItem, Post, ProviderInfo, Slot, SocialAccount } from './types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
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
  action: 'draft' | 'schedule' | 'publish';
  scheduledAt?: string;
}

export const api = {
  providers: () => request<ProviderInfo[]>('/api/providers'),
  accounts: () => request<SocialAccount[]>('/api/accounts'),
  disconnectAccount: (id: string) => request<void>(`/api/accounts/${id}`, { method: 'DELETE' }),

  posts: () => request<Post[]>('/api/posts'),
  createPost: (input: CreatePostInput) => request<Post>('/api/posts', json('POST', input)),
  updatePost: (id: string, patch: Partial<PostInput> & { action?: 'draft' | 'schedule' | 'publish'; scheduledAt?: string }) =>
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
