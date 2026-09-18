import { Platform } from '../types';

/** Message the popup's finish page sends back to the window that started the connection. */
export interface ConnectMessage {
  connected?: Platform;
  count?: number;
  select?: string;
  error?: string;
}

// BroadcastChannel (not window.opener) because some sign-in pages sever the opener link.
export const CONNECT_CHANNEL = 'scx-connect';

/**
 * Opens the platform's sign-in in a popup. Must run inside a click handler or browsers will block it.
 * Returns null when blocked so the caller can fall back to a full-page redirect.
 */
export function openConnectWindow(platform: Platform, variant?: string): Window | null {
  const url = `/api/auth/${platform}/start?popup=1${variant ? `&variant=${encodeURIComponent(variant)}` : ''}`;
  const w = 560, h = 720;
  const left = Math.max(0, window.screenX + (window.outerWidth - w) / 2);
  const top = Math.max(0, window.screenY + (window.outerHeight - h) / 2);
  return window.open(url, 'scx-connect', `popup=yes,width=${w},height=${h},left=${left},top=${top}`);
}

/** Full-page fallback when popups are blocked. The server finishes on /connect/done and forwards to Accounts. */
export function connectInThisTab(platform: Platform, variant?: string) {
  window.location.href = `/api/auth/${platform}/start${variant ? `?variant=${encodeURIComponent(variant)}` : ''}`;
}
