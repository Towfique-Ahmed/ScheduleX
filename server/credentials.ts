import { decrypt, encrypt } from './crypto.ts';
import type { Provider } from './providers/types.ts';
import { data, save } from './store.ts';

/**
 * Developer-app credentials come from the environment (wins) or from what an admin saved in the UI.
 * Saved values are encrypted with the same key as OAuth tokens and are never sent back to the browser.
 */
export function cred(name: string): string {
  const fromEnv = process.env[name];
  if (fromEnv) return fromEnv;
  const saved = data().credentials[name];
  if (!saved) return '';
  try { return decrypt(saved); } catch { return ''; }
}

export const credSource = (name: string): 'env' | 'saved' | null =>
  process.env[name] ? 'env' : data().credentials[name] ? 'saved' : null;

const label = (name: string) =>
  /APP_SECRET$/.test(name) ? 'App secret' : /SECRET$/.test(name) ? 'Client secret'
  : /APP_ID$/.test(name) ? 'App ID' : /CLIENT_KEY$/.test(name) ? 'Client key' : /CLIENT_ID$/.test(name) ? 'Client ID' : name;

/** What a provider needs, and whether each piece is set (never the values). */
export function credentialFields(p: Provider) {
  return [
    ...p.envVars.map(name => ({ name, required: true })),
    ...(p.optionalEnvVars ?? []).map(name => ({ name, required: false })),
  ].map(({ name, required }) => ({ name, label: label(name), secret: /SECRET/.test(name), required, set: !!cred(name), source: credSource(name) }));
}

/** Saves values for a provider. Blank values are ignored (keep what's there); unknown names are rejected. */
export function saveCredentials(p: Provider, values: Record<string, unknown>): string | null {
  const allowed = new Set([...p.envVars, ...(p.optionalEnvVars ?? [])]);
  const clean: Record<string, string> = {};
  for (const [name, raw] of Object.entries(values ?? {})) {
    if (!allowed.has(name)) return `${name} isn't a setting for ${p.name}.`;
    const v = typeof raw === 'string' ? raw.trim() : '';
    if (!v) continue;
    if (!/^\S{1,500}$/.test(v)) return `${label(name)} can't contain spaces.`;
    clean[name] = v;
  }
  for (const [name, v] of Object.entries(clean)) data().credentials[name] = encrypt(v);
  save();
  return null;
}

export function clearCredentials(p: Provider) {
  for (const name of [...p.envVars, ...(p.optionalEnvVars ?? [])]) delete data().credentials[name];
  save();
}
