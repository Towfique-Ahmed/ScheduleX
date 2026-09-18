import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { platformConfig } from '../utils/platforms';
import { Post } from '../types';

export default function Approvals() {
  const { posts, accounts, members, media, approvePost, rejectPost } = useApp();
  const pending = posts.filter(p => p.status === 'pending_approval').sort((a, b) => a.approval!.requestedAt.localeCompare(b.approval!.requestedAt));
  const [rejecting, setRejecting] = useState<Post | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { if (!rejecting) setNote(''); }, [rejecting]);

  const who = (id: string | null) => members.find(m => m.id === id)?.name ?? 'Someone';
  const run = async (id: string, fn: () => Promise<void>) => {
    setBusy(id);
    try { await fn(); setError(null); setRejecting(null); } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(null); }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Approvals</h1>
        <p className="subtitle">Posts submitted by contributors. Approving schedules them at the requested time.</p>
      </div>
      {error && <div className="notice notice-error" role="alert"><span>{error}</span></div>}
      {pending.length === 0 ? (
        <div className="card empty-state"><p>Nothing waiting for approval.</p></div>
      ) : pending.map(p => (
        <div key={p.id} className="card approval-card">
          <div className="approval-meta">
            <strong>{who(p.approval!.requestedBy)}</strong> asked {new Date(p.approval!.requestedAt).toLocaleString()} ·{' '}
            {p.scheduledAt ? <>for <strong>{new Date(p.scheduledAt).toLocaleString()}</strong></> : 'to publish as soon as approved'}
          </div>
          <p className="post-card-content">{p.content}</p>
          {p.mediaIds.length > 0 && (
            <div className="attached-media">
              {p.mediaIds.map(id => media.find(m => m.id === id)).filter(Boolean).map(m => <img key={m!.id} className="media-thumb" style={{ width: 64 }} src={m!.url} alt={m!.name} />)}
            </div>
          )}
          <div className="post-platforms">
            {p.accounts.map(id => {
              const a = accounts.find(x => x.id === id);
              return a ? <span key={id} className="platform-tag" style={{ background: platformConfig[a.platform].color }}>{platformConfig[a.platform].icon} {a.displayName}</span> : null;
            })}
          </div>
          <div className="post-card-actions" style={{ marginTop: 12 }}>
            <button className="btn btn-sm btn-outline" disabled={busy === p.id} onClick={() => setRejecting(p)}>Request changes</button>
            <button className="btn btn-sm btn-primary" disabled={busy === p.id} onClick={() => run(p.id, () => approvePost(p.id))}>Approve</button>
          </div>
        </div>
      ))}

      {rejecting && (
        <div className="modal-backdrop" onClick={() => setRejecting(null)}>
          <form className="modal card" role="dialog" aria-modal="true" aria-label="Request changes" onClick={e => e.stopPropagation()}
            onSubmit={e => { e.preventDefault(); void run(rejecting.id, () => rejectPost(rejecting.id, note)); }}>
            <div className="card-header"><h2>Request changes</h2></div>
            <p className="hint" style={{ marginTop: 0 }}>The post goes back to {who(rejecting.approval!.requestedBy)} as a draft, with your note.</p>
            <textarea className="compose-textarea" rows={4} value={note} onChange={e => setNote(e.target.value)} placeholder="What should change?" autoFocus required maxLength={500} />
            <div className="modal-actions">
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setRejecting(null)}>Cancel</button>
              <button className="btn btn-primary btn-sm" disabled={!note.trim()}>Send back</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
