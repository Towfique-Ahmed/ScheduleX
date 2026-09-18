import type { Platform } from '../store.ts';
import type { Provider } from './types.ts';
import { linkedin } from './linkedin.ts';
import { x } from './x.ts';

export const providers: Partial<Record<Platform, Provider>> = {
  twitter: x,
  linkedin,
};

/** Platforms shown in the UI. Ones without a provider are listed as coming soon. */
export const allPlatforms: Platform[] = ['twitter', 'linkedin', 'facebook', 'instagram', 'tiktok', 'pinterest'];
