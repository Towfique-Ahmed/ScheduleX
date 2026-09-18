import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { assignableRoles, ROLE_LABELS } from '../utils/roles';
import { Invite, Role, User } from '../types';

export default function Team() {
  const { user } = useAuth();
  const [members, setMembers] = useState<User[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [role, setRole] = useState<Role>('contributor');
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const me = user!;
  const assignable = assignableRoles(me.role);

  const load = useCallback(async () => {
    try { const [m, i] = await Promise.all([api.members(), api.invites()]); setMembers(m); setInvites(i); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load team'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    try { await fn(); setError(null); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
  };
  const editable = (m: User) => m.id !== me.id && m.role !== 'owner' && (me.role === 'owner' || assignable.includes(m.role));

  return (
    <div>
      <div className="page-header">
        <h1>Team</h1>
        <p className="subtitle">Invite teammates and control what they can do. Contributors' posts need an editor's approval before they go out.</p>
      </div>
      {error && <div className="notice notice-error" role="alert"><span>{error}</span></div>}

      <div className="card">
        <div className="card-header"><h2>Invite someone</h2></div>
        <form className="inline-form" onSubmit={e => { e.preventDefault(); void run(async () => { const r = await api.createInvite(role); setLink(r.url); setCopied(false); }); }}>
          <select value={role} onChange={e => setRole(e.target.value as Role)} aria-label="Role">
            {assignable.map(r => <option key={r} value={r}>{ROLE_LABELS[r].label} — {ROLE_LABELS[r].help}</option>)}
          </select>
          <button className="btn btn-primary btn-sm">Create invite link</button>
        </form>
        {link && (
          <div className="invite-link">
            <code>{link}</code>
            <button className="btn btn-sm btn-outline" onClick={() => { void navigator.clipboard.writeText(link).then(() => setCopied(true)); }}>{copied ? 'Copied' : 'Copy'}</button>
            <p className="hint">Send this link to them. It works once and expires in 7 days. It's shown only now.</p>
          </div>
        )}
        {invites.length > 0 && (
          <ul className="category-list">
            {invites.map(i => (
              <li key={i.id}>
                <span className="cat-name">Pending invite · {ROLE_LABELS[i.role].label}</span>
                <span className="cat-count">expires {new Date(i.expiresAt).toLocaleDateString()}</span>
                <button className="btn btn-sm btn-outline" onClick={() => run(() => api.deleteInvite(i.id))}>Revoke</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header"><h2>Members ({members.length})</h2></div>
        <ul className="category-list">
          {members.map(m => (
            <li key={m.id}>
              <span className="cat-name"><strong>{m.name}</strong>{m.id === me.id && ' (you)'}<br /><small className="hint">{m.email}</small></span>
              {editable(m) ? (
                <select value={m.role} aria-label={`Role for ${m.name}`} onChange={e => run(() => api.setRole(m.id, e.target.value as Role))}>
                  {[...new Set([m.role, ...assignable])].map(r => <option key={r} value={r}>{ROLE_LABELS[r].label}</option>)}
                </select>
              ) : <span className="tag">{ROLE_LABELS[m.role].label}</span>}
              {editable(m) && <button className="btn btn-sm btn-danger" onClick={() => { if (confirm(`Remove ${m.name}? They'll be signed out immediately.`)) void run(() => api.removeMember(m.id)); }}>Remove</button>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
