import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { ROLE_LABELS } from '../utils/roles';
import { Role } from '../types';

type Mode = 'login' | 'setup' | 'invite';

export default function SignIn({ mode }: { mode: Mode }) {
  const { setUser } = useAuth();
  const { token } = useParams();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [inviteRole, setInviteRole] = useState<Role | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  useEffect(() => {
    if (mode === 'invite' && token) api.inviteInfo(token).then(r => setInviteRole(r.role)).catch(e => setInviteError(e.message));
  }, [mode, token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = mode === 'login' ? await api.login({ email, password })
        : mode === 'setup' ? await api.signup({ name, email, password })
        : await api.acceptInvite({ token: token!, name, email, password });
      setUser(r.user);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setBusy(false);
    }
  };

  const title = mode === 'login' ? 'Sign in' : mode === 'setup' ? 'Create your workspace' : 'Join the team';
  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={submit}>
        <div className="auth-logo">⚡ ScheduleX</div>
        <h1>{title}</h1>
        {mode === 'setup' && <p className="subtitle">You'll be the owner. You can invite teammates afterwards.</p>}
        {mode === 'invite' && (inviteError
          ? <div className="notice notice-error"><span>{inviteError}</span></div>
          : inviteRole && <p className="subtitle">You've been invited as <strong>{ROLE_LABELS[inviteRole].label}</strong>.</p>)}
        {mode !== 'login' && (
          <label className="field"><span>Name</span>
            <input value={name} onChange={e => setName(e.target.value)} required autoComplete="name" />
          </label>
        )}
        <label className="field"><span>Email</span>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label className="field"><span>Password</span>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={mode === 'login' ? undefined : 10}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          {mode !== 'login' && <small className="hint">At least 10 characters.</small>}
        </label>
        {error && <div className="notice notice-error" role="alert"><span>{error}</span></div>}
        <button className="btn btn-primary" disabled={busy || (mode === 'invite' && !!inviteError)}>{busy ? 'Please wait…' : title}</button>
      </form>
    </div>
  );
}
