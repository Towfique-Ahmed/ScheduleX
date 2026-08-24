import { Platform } from '../types';

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
