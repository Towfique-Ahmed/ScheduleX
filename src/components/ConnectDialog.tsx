import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useApp } from '../context/AppContext';
import { CONNECT_CHANNEL, ConnectMessage, connectInThisTab, openConnectWindow } from '../utils/connect';
import { DEV_PORTALS, platformConfig, SCOPE_TEXT, SETUP_NOTES } from '../utils/platforms';
import { useAuth } from '../context/AuthContext';
import { Platform, ProviderInfo, SelectableAccount } from '../types';

type Step =
  | { kind: 'grid' }
  | { kind: 'variant'; provider: ProviderInfo }
  | { kind: 'waiting'; platform: Platform }
  | { kind: 'select'; id: string; platform: Platform; accounts: SelectableAccount[]; chosen: string[] }
  | { kind: 'setup'; provider: ProviderInfo; reconfigure?: boolean };

export interface ConnectResult { kind: 'success' | 'error'; text: string }

interface Props {
  onClose: () => void;
  onResult: (r: ConnectResult) => void;
  /** Reconnect: a popup the caller already opened (inside its click handler) for this platform. */
  resume?: { platform: Platform; popup: Window | null };
  /** Continue a login that ended with several accounts (used when the full-page fallback was taken). */
  selectId?: string;
}

const successText = (platform: Platform, count = 1) =>
  `${count > 1 ? `${count} ` : ''}${platformConfig[platform].name} account${count > 1 ? 's' : ''} connected.`;

export default function ConnectDialog({ onClose, onResult, resume, selectId }: Props) {
  const { providers, refresh } = useApp();
  const { can } = useAuth();
  const [values, setValues] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState<Step>(resume ? { kind: 'waiting', platform: resume.platform } : { kind: 'grid' });
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const popupRef = useRef<Window | null>(resume?.popup ?? null);
  const gotResult = useRef(false);

  const loadSelection = useCallback(async (id: string) => {
    try {
      const s = await api.selection(id);
      setStep({ kind: 'select', id, platform: s.platform, accounts: s.accounts, chosen: s.accounts.map(a => a.externalId) });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not load your accounts.');
      setStep({ kind: 'grid' });
    }
  }, []);

  const handle = useCallback(async (m: ConnectMessage) => {
    gotResult.current = true;
    if (m.error) { setMessage(m.error.slice(0, 300)); setStep({ kind: 'grid' }); return; }
    if (m.select) { await loadSelection(m.select); return; }
    if (m.connected) {
      await refresh();
      onResult({ kind: 'success', text: successText(m.connected, m.count) });
    }
  }, [loadSelection, onResult, refresh]);

  useEffect(() => { if (selectId) void loadSelection(selectId); }, [selectId, loadSelection]);

  // Results arrive from the popup's finish page.
  useEffect(() => {
    let ch: BroadcastChannel | null = null;
    try { ch = new BroadcastChannel(CONNECT_CHANNEL); ch.onmessage = e => void handle(e.data as ConnectMessage); } catch { /* polling below still covers closed popups */ }
    return () => ch?.close();
  }, [handle]);

  // If the popup is closed without a result, the user cancelled: go back quietly.
  useEffect(() => {
    if (step.kind !== 'waiting') return;
    gotResult.current = false;
    const t = setInterval(() => {
      if (popupRef.current?.closed) {
        clearInterval(t);
        setTimeout(() => { if (!gotResult.current) { setMessage('The sign-in window was closed before finishing.'); setStep({ kind: 'grid' }); } }, 1500);
      }
    }, 500);
    return () => clearInterval(t);
  }, [step.kind]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const start = (platform: Platform, variant?: string) => {
    setMessage(null);
    const w = openConnectWindow(platform, variant);
    if (!w) { connectInThisTab(platform, variant); return; } // popups blocked: continue in this tab
    popupRef.current = w;
    setStep({ kind: 'waiting', platform });
  };

  /** Where to go once a platform is usable: pick Profile/Page, or straight to its sign-in. */
  const proceed = (p: ProviderInfo) => {
    if (p.variants.length > 1) setStep({ kind: 'variant', provider: p });
    else start(p.platform);
  };

  const saveAndContinue = async () => {
    if (step.kind !== 'setup') return;
    setBusy(true); setMessage(null);
    try {
      const updated = await api.saveCredentials(step.provider.platform, values);
      await refresh();
      setValues({});
      if (!updated.configured) {
        const missing = updated.credentials.filter(c => c.required && !c.set).map(c => c.label).join(' and ');
        setMessage(`Still needed: ${missing}.`);
        setStep({ kind: 'setup', provider: updated, reconfigure: step.reconfigure });
      } else proceed(updated);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not save.');
    }
    setBusy(false);
  };

  const removeCredentials = async () => {
    if (step.kind !== 'setup' || !confirm(`Remove the saved ${platformConfig[step.provider.platform].name} app credentials? Already-connected accounts may stop refreshing until they're set again.`)) return;
    try { const updated = await api.clearCredentials(step.provider.platform); await refresh(); setStep({ kind: 'setup', provider: updated }); setMessage(null); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Could not remove.'); }
  };

  const pick = (p: ProviderInfo) => {
    setValues({}); setMessage(null);
    if (!p.configured) setStep({ kind: 'setup', provider: p });
    else proceed(p);
  };

  const cancel = async () => {
    if (step.kind === 'select') await api.cancelSelection(step.id).catch(() => undefined);
    popupRef.current?.close();
    onClose();
  };

  const confirmChosen = async () => {
    if (step.kind !== 'select') return;
    setBusy(true);
    try {
      const r = await api.confirmSelection(step.id, step.chosen);
      await refresh();
      onResult({ kind: 'success', text: successText(r.platform, r.count) });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not connect those accounts.');
      setBusy(false);
    }
  };

  const title =
    step.kind === 'grid' ? 'Add your social accounts'
    : step.kind === 'variant' ? platformConfig[step.provider.platform].name
    : step.kind === 'waiting' ? `Connecting ${platformConfig[step.platform].name}`
    : step.kind === 'select' ? `Choose ${platformConfig[step.platform].name} accounts`
    : `Connect ${platformConfig[step.provider.platform].name}`;

  return (
    <div className="modal-backdrop" onClick={() => void cancel()}>
      <div className="modal card connect-dialog" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        <div className="card-header">
          <h2>{title}</h2>
          <button className="notice-close" onClick={() => void cancel()} aria-label="Close">×</button>
        </div>
        {message && <div className="notice notice-error" role="alert"><span>{message}</span></div>}

        {step.kind === 'grid' && (
          <>
            <p className="hint" style={{ marginTop: 0 }}>Connect your Facebook, Instagram, X, LinkedIn and more. You'll sign in on the platform's own page; ScheduleX never sees your password.</p>
            <div className="connect-grid">
              {providers.map(p => {
                const c = platformConfig[p.platform];
                return (
                  <div key={p.platform} className="connect-tile-wrap">
                    <button className="connect-tile" onClick={() => pick(p)}>
                      <span className="connect-tile-icon" style={{ background: c.color }}>{c.icon}</span>
                      <span className="connect-tile-name">{c.name}</span>
                      {!p.configured && <span className="connect-tile-flag">One-time setup</span>}
                    </button>
                    {p.configured && can.manageAccounts && (
                      <button className="tile-gear" aria-label={`${c.name} app settings`} title="App settings"
                        onClick={() => { setValues({}); setMessage(null); setStep({ kind: 'setup', provider: p, reconfigure: true }); }}>⚙</button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {step.kind === 'variant' && (
          <>
            <div className="brand-row">
              <span className="connect-tile-icon" style={{ background: platformConfig[step.provider.platform].color }}>{platformConfig[step.provider.platform].icon}</span>
              <div>
                <strong>{platformConfig[step.provider.platform].name}</strong>
                <div className="hint">What do you want to connect?</div>
              </div>
            </div>
            <div className="variant-row">
              {step.provider.variants.map(v => (
                <button key={v.id} className="connect-tile variant-tile" onClick={() => start(step.provider.platform, v.id)}>
                  <span className="variant-icon" aria-hidden>{v.id === 'page' ? '🏢' : '👤'}</span>
                  <span className="connect-tile-name">{v.label}</span>
                  <span className="hint">{v.description}</span>
                  {v.scopes && (
                    <ul className="scope-list" aria-label={`${v.label} permissions`}>
                      {v.scopes.filter(sc => sc !== 'openid').map(sc => <li key={sc}>{SCOPE_TEXT[sc] ?? sc}</li>)}
                    </ul>
                  )}
                </button>
              ))}
            </div>
            <p className="hint">Next you'll sign in on {platformConfig[step.provider.platform].name} and approve exactly these permissions. You can revoke them there at any time.</p>
            <div className="modal-actions"><button className="btn btn-outline btn-sm" onClick={() => setStep({ kind: 'grid' })}>← Back</button></div>
          </>
        )}

        {step.kind === 'waiting' && (
          <div className="waiting">
            <div className="spinner" role="status" aria-label="Waiting" />
            <p>Finish signing in to {platformConfig[step.platform].name} in the window that just opened.</p>
            <p className="hint">This screen updates by itself when you're done. Nothing appears? Check that your browser allowed the popup.</p>
            <div className="modal-actions" style={{ justifyContent: 'center' }}>
              <button className="btn btn-outline btn-sm" onClick={() => { popupRef.current?.close(); setStep({ kind: 'grid' }); }}>Cancel</button>
              <button className="btn btn-outline btn-sm" onClick={() => { popupRef.current?.close(); connectInThisTab(step.platform); }}>Continue in this tab instead</button>
            </div>
          </div>
        )}

        {step.kind === 'select' && (
          <>
            <p className="hint" style={{ marginTop: 0 }}>Pick the accounts you want to publish to. You can add more later.</p>
            <ul className="select-list">
              {step.accounts.map(a => {
                const on = step.chosen.includes(a.externalId);
                return (
                  <li key={a.externalId}>
                    <label className="radio-option">
                      <input type="checkbox" checked={on}
                        onChange={() => setStep({ ...step, chosen: on ? step.chosen.filter(x => x !== a.externalId) : [...step.chosen, a.externalId] })} />
                      {a.avatar && <img className="account-avatar" style={{ width: 32, height: 32 }} src={a.avatar} alt="" referrerPolicy="no-referrer" />}
                      <span><strong>{a.displayName}</strong><br /><span className="hint">{a.username}{a.alreadyConnected ? ' · already connected (will be refreshed)' : ''}</span></span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <div className="modal-actions">
              <button className="btn btn-outline btn-sm" onClick={() => void cancel()}>Cancel</button>
              <button className="btn btn-primary btn-sm" disabled={busy || step.chosen.length === 0} onClick={() => void confirmChosen()}>
                {busy ? 'Connecting…' : `Connect ${step.chosen.length} account${step.chosen.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </>
        )}

        {step.kind === 'setup' && (() => {
          const pf = step.provider, name = platformConfig[pf.platform].name, portal = DEV_PORTALS[pf.platform];
          const fields = pf.credentials;
          const ready = fields.filter(f => f.required).every(f => values[f.name]?.trim() || f.set);
          return (
            <>
              <p style={{ marginTop: 0 }}>
                {step.reconfigure
                  ? `These are the ${name} app credentials ScheduleX signs people in with.`
                  : `${name} only lets registered apps sign people in. Register ScheduleX with ${name} once (about 2 minutes); after that, connecting is one click for everyone.`}
              </p>
              <ol className="wizard">
                <li>
                  <strong>Create an app</strong> on {portal.label}.
                  <div><a className="btn btn-outline btn-sm" href={portal.url} target="_blank" rel="noreferrer">Open {portal.label} ↗</a></div>
                </li>
                <li>
                  <strong>Add this redirect URL</strong> to the app:
                  <div className="copy-row">
                    <code className="setup-code">{pf.redirectUri}</code>
                    <button className="btn btn-outline btn-sm" onClick={() => { void navigator.clipboard.writeText(pf.redirectUri ?? '').then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>{copied ? 'Copied' : 'Copy'}</button>
                  </div>
                </li>
                <li>
                  <strong>Paste the app's credentials</strong>:
                  <div className="cred-fields">
                    {fields.map(f => (
                      <label key={f.name} className="field">
                        <span>{f.label}{f.required ? '' : ' (optional)'}</span>
                        <input type={f.secret ? 'password' : 'text'} autoComplete="off" spellCheck={false}
                          value={values[f.name] ?? ''} onChange={e => setValues({ ...values, [f.name]: e.target.value })}
                          disabled={f.source === 'env'}
                          placeholder={f.source === 'env' ? 'Set on the server' : f.set ? '•••••••• saved. Leave blank to keep' : ''} />
                      </label>
                    ))}
                  </div>
                </li>
              </ol>
              {(SETUP_NOTES[pf.platform] ?? []).length > 0 && (
                <details className="tips"><summary>Tips for {name}</summary>
                  <ul className="setup-notes">{SETUP_NOTES[pf.platform]!.map(n => <li key={n}>{n}</li>)}</ul>
                </details>
              )}
              <div className="modal-actions">
                {step.reconfigure && fields.some(f => f.source === 'saved') && <button className="btn btn-outline btn-sm" style={{ marginRight: 'auto' }} onClick={() => void removeCredentials()}>Remove saved credentials</button>}
                <button className="btn btn-outline btn-sm" onClick={() => setStep({ kind: 'grid' })}>← Back</button>
                <button className="btn btn-primary btn-sm" disabled={busy || !ready} onClick={() => void saveAndContinue()}>
                  {busy ? 'Saving…' : step.reconfigure ? 'Save' : `Save & continue to ${name}`}
                </button>
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}
