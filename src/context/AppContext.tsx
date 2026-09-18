import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, CreatePostInput, PostInput } from '../api';
import { AnalyticsData, Category, MediaItem, Post, ProviderInfo, Slot, SocialAccount } from '../types';

interface AppState {
  posts: Post[];
  accounts: SocialAccount[];
  providers: ProviderInfo[];
  media: MediaItem[];
  categories: Category[];
  slots: Slot[];
  analytics: AnalyticsData[];
  loading: boolean;
  error: string | null;
  createPost: (input: CreatePostInput) => Promise<Post>;
  updatePost: (id: string, patch: Partial<PostInput> & { action?: 'draft' | 'schedule' | 'publish'; scheduledAt?: string }) => Promise<Post>;
  retryPost: (id: string) => Promise<void>;
  deletePost: (id: string) => Promise<void>;
  disconnectAccount: (id: string) => Promise<void>;
  uploadMedia: (file: File) => Promise<MediaItem>;
  deleteMedia: (id: string) => Promise<void>;
  createCategory: (name: string, color: string) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  saveSlots: (slots: { day: number; time: string }[]) => Promise<void>;
  refresh: () => Promise<void>;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [p, a, pr, m, c, s] = await Promise.all([
        api.posts(), api.accounts(), api.providers(), api.media(), api.categories(), api.slots(),
      ]);
      setPosts(p); setAccounts(a); setProviders(pr); setMedia(m); setCategories(c); setSlots(s);
      setError(null);
    } catch {
      setError('Cannot reach the ScheduleX server. Start it with `npm run dev`.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Scheduled posts are published server-side; poll so status changes show up.
    const timer = setInterval(() => void refresh(), 15_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const createPost = useCallback(async (input: CreatePostInput) => {
    const post = await api.createPost(input);
    setPosts(prev => [...prev, post]);
    return post;
  }, []);

  const updatePost = useCallback(async (id: string, patch: Parameters<typeof api.updatePost>[1]) => {
    const post = await api.updatePost(id, patch);
    setPosts(prev => prev.map(p => (p.id === id ? post : p)));
    return post;
  }, []);

  const retryPost = useCallback(async (id: string) => {
    const post = await api.retryPost(id);
    setPosts(prev => prev.map(p => (p.id === id ? post : p)));
  }, []);

  const deletePost = useCallback(async (id: string) => {
    await api.deletePost(id);
    setPosts(prev => prev.filter(p => p.id !== id));
  }, []);

  const disconnectAccount = useCallback(async (id: string) => {
    await api.disconnectAccount(id);
    setAccounts(prev => prev.filter(a => a.id !== id));
  }, []);

  const uploadMedia = useCallback(async (file: File) => {
    const item = await api.uploadMedia(file);
    setMedia(prev => [item, ...prev]);
    return item;
  }, []);

  const deleteMedia = useCallback(async (id: string) => {
    await api.deleteMedia(id);
    setMedia(prev => prev.filter(m => m.id !== id));
  }, []);

  const createCategory = useCallback(async (name: string, color: string) => {
    const c = await api.createCategory(name, color);
    setCategories(prev => [...prev, c]);
  }, []);

  const deleteCategory = useCallback(async (id: string) => {
    await api.deleteCategory(id);
    setCategories(prev => prev.filter(c => c.id !== id));
    setPosts(prev => prev.map(p => (p.categoryId === id ? { ...p, categoryId: null } : p)));
  }, []);

  const saveSlots = useCallback(async (next: { day: number; time: string }[]) => {
    setSlots(await api.saveSlots(next));
  }, []);

  // Not backed by real data yet: derived from connected accounts with placeholder numbers.
  const analytics = useMemo<AnalyticsData[]>(
    () =>
      [...new Set(accounts.map(a => a.platform))].map(platform => ({
        platform, followers: 0, engagement: 0, impressions: 0, clicks: 0, trend: 0,
      })),
    [accounts],
  );

  return (
    <AppContext.Provider
      value={{
        posts, accounts, providers, media, categories, slots, analytics, loading, error,
        createPost, updatePost, retryPost, deletePost, disconnectAccount,
        uploadMedia, deleteMedia, createCategory, deleteCategory, saveSlots, refresh,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
