import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { platformConfig, SETUP_NOTES } from '../utils/platforms';
import { ProviderInfo } from '../types';

export default function Accounts() {
  const { accounts, providers, disconnectAccount, refresh } = useApp();
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [setupFor, setSetupFor] = useState<ProviderInfo | null>(null);

  // The OAuth callback redirects back here with ?connected=<platform> or ?error=<message>.
  useEffect(() => {
    const connected = params.get('connected');
    const error = params.get('error');
    const count = Number(params.get('count') ?? 1);
    if (!connected && !error) return;
    setNotice(connected
      ? { kind: 'success', text: `${count > 1 ? `${count} ` : ''}${platformConfig[connected as keyof typeof platformConfig]?.name ?? connected} account${count > 1 ? 's' : ''} connected.` }
      : { kind: 'error', text: error! });
    setParams({}, { replace: true });
    void refresh();
  }, [params, setParams, refresh]);

  const connect = (p: ProviderInfo) => {
    if (!p.configured) return setSetupFor(p);
    // Full-page navigation: the server redirects to the platform's consent screen.
    window.location.href = `/api/auth/${p.platform}/start`;
  };

  return (
    <div className="accounts-page">
      <div className="page-header">
        <h1>Social Accounts</h1>
        <p className="subtitle">Connect your real accounts. ScheduleX posts on your behalf through each platform's official API.</p>
      </div>

      {notice && (
        <div className={`notice notice-${notice.kind}`} role="status">
          <span>{notice.text}</span>
          <button className="notice-close" onClick={() => setNotice(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      <h2 className="section-title">Connected accounts</h2>
      {accounts.length === 0 ? (
        <div className="card empty-state"><p>No accounts connected yet. Pick a platform below to get started.</p></div>
      ) : (
        <div className="accounts-grid">
          {accounts.map(account => {
            const config = platformConfig[account.platform];
            const provider = providers.find(p => p.platform === account.platform);
            return (
              <div key={account.id} className={`card account-card ${account.connected ? 'connected' : ''}`}>
                <div className="account-header" style={{ borderTopColor: config.color }}>
                  {account.avatar
                    ? <img className="account-avatar" src={account.avatar} alt="" referrerPolicy="no-referrer" />
                    : <div className="account-icon" style={{ background: config.color }}>{config.icon}</div>}
                  <div className="account-info">
                    <h3>{account.displayName}</h3>
                    <span className="account-username">{config.name} · {account.username}</span>
                  </div>
                </div>
                <div className="account-body">
                  <span className={`connection-status ${account.connected ? 'connected' : 'disconnected'}`}>
                    {account.connected ? '● Connected' : '⚠ Reconnect needed'}
                  </span>
                </div>
                <div className="account-footer">
                  {can.manageAccounts && !account.connected && provider && (
                    <button className="btn btn-sm btn-primary" onClick={() => connect(provider)}>Reconnect</button>
                  )}
                  {can.manageAccounts && <button
                    className="btn btn-sm btn-danger"
                    onClick={() => { if (confirm(`Disconnect ${account.displayName}? Scheduled posts for it will fail.`)) void disconnectAccount(account.id); }}
                  >
                    Disconnect
                  </button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {can.manageAccounts ? <><h2 className="section-title">Add an account</h2>
      <div className="accounts-grid">
        {providers.map(p => {
          const config = platformConfig[p.platform];
          return (
            <div key={p.platform} className="card account-card">
              <div className="account-header" style={{ borderTopColor: config.color }}>
                <div className="account-icon" style={{ background: config.color }}>{config.icon}</div>
                <div className="account-info">
                  <h3>{config.name}</h3>
                  <span className="account-username">
                    {!p.supported ? 'Coming soon' : p.configured ? 'Ready to connect' : 'Setup required'}
                  </span>
                </div>
              </div>
              <div className="account-footer">
                <button className="btn btn-sm btn-primary" disabled={!p.supported} onClick={() => connect(p)}>
                  {p.supported ? (p.configured ? 'Connect account' : 'Set up') : 'Coming soon'}
                </button>
              </div>
            </div>
          );
        })}
      </div></> : <p className="hint">Only admins can connect or disconnect accounts.</p>}

      {setupFor && (
        <div className="modal-backdrop" onClick={() => setSetupFor(null)}>
          <div className="modal card" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="card-header">
              <h2>Set up {platformConfig[setupFor.platform].name}</h2>
              <button className="notice-close" onClick={() => setSetupFor(null)} aria-label="Close">×</button>
            </div>
            <ol className="setup-steps">
              <li>Create a developer app on the {platformConfig[setupFor.platform].name} developer portal.</li>
              <li>Add this redirect / callback URL to the app:<code className="setup-code">{setupFor.redirectUri}</code></li>
              <li>Copy the app credentials into <code>.env</code> in the project root:
                <code className="setup-code">{setupFor.envVars.map(v => `${v}=...`).join('\n')}</code>
              </li>
              <li>Restart <code>npm run dev</code>, then click Connect account.</li>
            </ol>
            {(SETUP_NOTES[setupFor.platform] ?? []).length > 0 && (
              <ul className="setup-notes">{SETUP_NOTES[setupFor.platform]!.map(n => <li key={n}>{n}</li>)}</ul>
            )}
            <p className="hint">See <code>.env.example</code> for the exact scopes and products each platform needs.</p>
          </div>
        </div>
      )}
    </div>
  );
}
