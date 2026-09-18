import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ConnectDialog, { ConnectResult } from '../components/ConnectDialog';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { openConnectWindow, connectInThisTab } from '../utils/connect';
import { platformConfig } from '../utils/platforms';
import { Platform, SocialAccount } from '../types';

export default function Accounts() {
  const { accounts, disconnectAccount, refresh } = useApp();
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const [notice, setNotice] = useState<ConnectResult | null>(null);
  const [dialog, setDialog] = useState<{ open: boolean; resume?: { platform: Platform; popup: Window | null }; selectId?: string }>({ open: false });

  // Full-page fallback (popups blocked): the finish page forwards here with ?connected / ?error / ?select.
  useEffect(() => {
    const connected = params.get('connected') as Platform | null;
    const error = params.get('error');
    const select = params.get('select');
    const count = Number(params.get('count') ?? 1);
    if (!connected && !error && !select) return;
    if (select) setDialog({ open: true, selectId: select });
    else if (connected) setNotice({ kind: 'success', text: `${count > 1 ? `${count} ` : ''}${platformConfig[connected]?.name ?? connected} account${count > 1 ? 's' : ''} connected.` });
    else setNotice({ kind: 'error', text: `Connection problem: ${error!.slice(0, 300)}` });
    setParams({}, { replace: true });
    void refresh();
  }, [params, setParams, refresh]);

  // Reconnect reopens the sign-in the same way the account was first connected (e.g. a LinkedIn Page).
  const reconnect = (a: SocialAccount) => {
    const popup = openConnectWindow(a.platform, a.variant);
    if (!popup) return connectInThisTab(a.platform, a.variant);
    setDialog({ open: true, resume: { platform: a.platform, popup } });
  };

  const finished = (r: ConnectResult) => { setNotice(r); setDialog({ open: false }); };

  return (
    <div className="accounts-page">
      <div className="page-header">
        <h1>Social Accounts</h1>
        <p className="subtitle">Connect the accounts you post to. ScheduleX publishes through each platform's official API.</p>
      </div>

      {notice && (
        <div className={`notice notice-${notice.kind}`} role="status">
          <span>{notice.text}</span>
          <button className="notice-close" onClick={() => setNotice(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      {can.manageAccounts && (
        <div className="toolbar-row">
          <button className="btn btn-primary" onClick={() => { setNotice(null); setDialog({ open: true }); }}>＋ Connect social account</button>
        </div>
      )}

      {accounts.length === 0 ? (
        <div className="card empty-state">
          <p><strong>No social accounts found</strong></p>
          <p>{can.manageAccounts ? "You haven't connected any accounts yet." : 'An admin needs to connect accounts before you can post.'}</p>
          {can.manageAccounts && <button className="btn btn-outline btn-sm" onClick={() => { setNotice(null); setDialog({ open: true }); }}>Connect social account</button>}
        </div>
      ) : (
        <div className="accounts-grid">
          {accounts.map(account => {
            const config = platformConfig[account.platform];
            return (
              <div key={account.id} className={`card account-card ${account.connected ? 'connected' : ''}`}>
                <div className="account-header" style={{ borderTopColor: config.color }}>
                  {account.avatar
                    ? <img className="account-avatar" src={account.avatar} alt="" referrerPolicy="no-referrer" />
                    : <div className="account-icon" style={{ background: config.color }}>{config.icon}</div>}
                  <div className="account-info">
                    <h3>{account.displayName}</h3>
                    <span className="account-username">{config.name}{account.variant === 'page' ? ' Page' : ''} · {account.username}</span>
                  </div>
                </div>
                <div className="account-body">
                  <span className={`connection-status ${account.connected ? 'connected' : 'disconnected'}`}>
                    {account.connected ? '● Connected' : '⚠ Reconnect needed'}
                  </span>
                </div>
                {can.manageAccounts && (
                  <div className="account-footer">
                    {!account.connected && <button className="btn btn-sm btn-primary" onClick={() => reconnect(account)}>Reconnect</button>}
                    <button className="btn btn-sm btn-danger"
                      onClick={() => { if (confirm(`Disconnect ${account.displayName}? Scheduled posts for it will fail.`)) void disconnectAccount(account.id); }}>
                      Disconnect
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {dialog.open && (
        <ConnectDialog resume={dialog.resume} selectId={dialog.selectId} onClose={() => setDialog({ open: false })} onResult={finished} />
      )}
    </div>
  );
}
