import React, { createContext, useContext, useState, useCallback } from 'react';
import { Post, SocialAccount, Platform, AnalyticsData } from '../types';

interface AppState {
  posts: Post[];
  accounts: SocialAccount[];
  analytics: AnalyticsData[];
  addPost: (post: Omit<Post, 'id' | 'createdAt'>) => void;
  updatePost: (id: string, updates: Partial<Post>) => void;
  deletePost: (id: string) => void;
  toggleAccount: (id: string) => void;
}

const defaultAccounts: SocialAccount[] = [
  { id: '1', platform: 'twitter', username: '@schedulex', displayName: 'ScheduleX', avatar: '', connected: true },
  { id: '2', platform: 'facebook', username: 'ScheduleX', displayName: 'ScheduleX Page', avatar: '', connected: true },
  { id: '3', platform: 'instagram', username: '@schedulex', displayName: 'ScheduleX', avatar: '', connected: false },
  { id: '4', platform: 'linkedin', username: 'ScheduleX', displayName: 'ScheduleX Company', avatar: '', connected: true },
  { id: '5', platform: 'tiktok', username: '@schedulex', displayName: 'ScheduleX', avatar: '', connected: false },
  { id: '6', platform: 'pinterest', username: 'schedulex', displayName: 'ScheduleX', avatar: '', connected: false },
];

const defaultAnalytics: AnalyticsData[] = [
  { platform: 'twitter', followers: 12400, engagement: 4.2, impressions: 89000, clicks: 3200, trend: 12 },
  { platform: 'facebook', followers: 8900, engagement: 3.1, impressions: 45000, clicks: 1800, trend: -3 },
  { platform: 'linkedin', followers: 5600, engagement: 5.8, impressions: 32000, clicks: 2100, trend: 22 },
  { platform: 'instagram', followers: 15200, engagement: 6.1, impressions: 120000, clicks: 4500, trend: 8 },
];

const samplePosts: Post[] = [
  {
    id: '1', content: 'Excited to announce our new feature launch! Stay tuned for more updates. #product #launch',
    platforms: ['twitter', 'linkedin'], scheduledAt: new Date(Date.now() + 86400000).toISOString(),
    status: 'scheduled', mediaUrls: [], createdAt: new Date().toISOString(), accounts: ['1', '4'],
  },
  {
    id: '2', content: 'Behind the scenes of our team building session. Great vibes all around!',
    platforms: ['facebook', 'instagram'], scheduledAt: null,
    status: 'published', mediaUrls: [], createdAt: new Date(Date.now() - 86400000).toISOString(), accounts: ['2', '3'],
  },
  {
    id: '3', content: 'Tips for growing your social media presence in 2026:\n\n1. Be consistent\n2. Engage with your audience\n3. Use analytics to guide decisions',
    platforms: ['twitter', 'facebook', 'linkedin'], scheduledAt: new Date(Date.now() + 172800000).toISOString(),
    status: 'scheduled', mediaUrls: [], createdAt: new Date().toISOString(), accounts: ['1', '2', '4'],
  },
  {
    id: '4', content: 'Check out our latest blog post on content strategy!',
    platforms: ['twitter'], scheduledAt: null,
    status: 'draft', mediaUrls: [], createdAt: new Date(Date.now() - 3600000).toISOString(), accounts: ['1'],
  },
];

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [posts, setPosts] = useState<Post[]>(samplePosts);
  const [accounts, setAccounts] = useState<SocialAccount[]>(defaultAccounts);

  const addPost = useCallback((post: Omit<Post, 'id' | 'createdAt'>) => {
    setPosts(prev => [...prev, {
      ...post,
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
    }]);
  }, []);

  const updatePost = useCallback((id: string, updates: Partial<Post>) => {
    setPosts(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  }, []);

  const deletePost = useCallback((id: string) => {
    setPosts(prev => prev.filter(p => p.id !== id));
  }, []);

  const toggleAccount = useCallback((id: string) => {
    setAccounts(prev => prev.map(a => a.id === id ? { ...a, connected: !a.connected } : a));
  }, []);

  return (
    <AppContext.Provider value={{ posts, accounts, analytics: defaultAnalytics, addPost, updatePost, deletePost, toggleAccount }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
