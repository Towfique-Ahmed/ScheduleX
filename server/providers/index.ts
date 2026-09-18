import type { Platform } from '../store.ts';
import type { Provider } from './types.ts';
import { facebook, instagram } from './meta.ts';
import { linkedin } from './linkedin.ts';
import { pinterest } from './pinterest.ts';
import { tiktok } from './tiktok.ts';
import { x } from './x.ts';

export const providers: Partial<Record<Platform, Provider>> = {
  twitter: x,
  linkedin,
  facebook,
  instagram,
  tiktok,
  pinterest,
};

/** Platforms shown in the UI, in display order. */
export const allPlatforms: Platform[] = ['twitter', 'linkedin', 'facebook', 'instagram', 'tiktok', 'pinterest'];
