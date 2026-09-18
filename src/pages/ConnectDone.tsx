import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CONNECT_CHANNEL, ConnectMessage } from '../utils/connect';
import { Platform } from '../types';

/**
 * OAuth lands here. In the popup it hands the result to the main window and closes itself;
 * if there is no popup (blocked, or opened in a tab) it forwards to the Accounts page instead.
 */
export default function ConnectDone() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const isPopup = params.get('popup') === '1' || window.name === 'scx-connect';

  useEffect(() => {
    const msg: ConnectMessage = {
      connected: (params.get('connected') as Platform) || undefined,
      count: params.get('count') ? Number(params.get('count')) : undefined,
      select: params.get('select') || undefined,
      error: params.get('error') || undefined,
    };
    if (isPopup) {
      try { const ch = new BroadcastChannel(CONNECT_CHANNEL); ch.postMessage(msg); ch.close(); } catch { /* no channel: the opener notices the closed window */ }
      const t = setTimeout(() => window.close(), 150);
      return () => clearTimeout(t);
    }
    navigate(`/accounts?${params.toString()}`, { replace: true });
  }, [params, isPopup, navigate]);

  const error = params.get('error');
  return (
    <div className="auth-page">
      <div className="card auth-card">
        <div className="auth-logo">⚡ ScheduleX</div>
        <h1>{error ? 'Connection problem' : 'Almost done…'}</h1>
        <p className="subtitle">{error ? error.slice(0, 300) : 'Returning to ScheduleX.'}</p>
        <p className="hint">You can close this window.</p>
      </div>
    </div>
  );
}
