import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { platformConfig } from '../utils/platforms';
import { InboxAccount, InboxItem } from '../types';
import { useApp } from '../context/AppContext';

export default function Inbox() {
  const { accounts, refresh: refreshApp } = useApp();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [inboxAccounts, setInboxAccounts] = useState<InboxAccount[]>([]);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [replying, setReplying] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { const r = await api.inbox(); setItems(r.items); setInboxAccounts(r.accounts); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load inbox'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); await load(); void refreshApp(); setError(null); } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    setBusy(false);
  };
  const acct = (id: string) => accounts.find(a => a.id === id);
  const shown = unreadOnly ? items.filter(i => !i.read) : items;

  return (
    <div>
      <div className="page-header">
        <h1>Inbox</h1>
        <p className="subtitle">Comments and mentions from your connected accounts, in one place. Refreshed every 10 minutes.</p>
      </div>
      {error && <div className="notice notice-error" role="alert"><span>{error}</span></div>}
      {inboxAccounts.filter(a => a.error).map(a => (
        <div key={a.id} className="notice notice-info"><span><strong>{a.displayName}:</strong> {a.error}</span></div>
      ))}
      <div className="toolbar-row">
        <button className="btn btn-sm btn-outline" disabled={busy} onClick={() => run(api.refreshInbox)}>{busy ? 'Working…' : '↻ Check now'}</button>
        <label className="radio-option"><input type="checkbox" checked={unreadOnly} onChange={e => setUnreadOnly(e.target.checked)} /><span>Unread only</span></label>
      </div>
      {inboxAccounts.length === 0 ? (
        <div className="card empty-state"><p>None of your connected accounts support reading comments yet. The inbox works for X, Facebook Pages and Instagram.</p></div>
      ) : shown.length === 0 ? (
        <div className="card empty-state"><p>{unreadOnly ? 'No unread messages.' : 'No comments or mentions yet.'}</p></div>
      ) : shown.map(i => {
        const a = acct(i.accountId);
        return (
          <div key={i.id} className={`card inbox-item ${i.read ? '' : 'unread'}`}>
            <div className="inbox-head">
              {a && <span className="platform-tag" style={{ background: platformConfig[a.platform].color }}>{platformConfig[a.platform].icon} {a.displayName}</span>}
              <strong>{i.author}</strong>
              <span className="hint">{new Date(i.at).toLocaleString()}</span>
            </div>
            {i.context && <div className="hint">On: “{i.context}”</div>}
            <p className="post-card-content">{i.text}</p>
            {i.reply && <div className="inbox-reply">↪ You replied: {i.reply.text}</div>}
            {replying === i.id ? (
              <form className="inline-form" onSubmit={e => { e.preventDefault(); void run(async () => { await api.replyTo(i.id, text); setReplying(null); setText(''); }); }}>
                <input value={text} onChange={e => setText(e.target.value)} placeholder="Write a reply…" maxLength={2000} autoFocus style={{ flex: 1, minWidth: 200 }} />
                <button className="btn btn-primary btn-sm" disabled={busy || !text.trim()}>Send</button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setReplying(null)}>Cancel</button>
              </form>
            ) : (
              <div className="post-card-actions">
                {i.url && <a className="btn btn-sm btn-outline" href={i.url} target="_blank" rel="noreferrer">Open</a>}
                <button className="btn btn-sm btn-outline" onClick={() => run(() => api.markRead(i.id, !i.read))}>{i.read ? 'Mark unread' : 'Mark read'}</button>
                {!i.reply && <button className="btn btn-sm btn-primary" onClick={() => { setReplying(i.id); setText(''); }}>Reply</button>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
