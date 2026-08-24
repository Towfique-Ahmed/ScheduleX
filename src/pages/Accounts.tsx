import React from 'react';
import { useApp } from '../context/AppContext';
import { platformConfig } from '../utils/platforms';

export default function Accounts() {
  const { accounts, toggleAccount } = useApp();

  return (
    <div className="accounts-page">
      <div className="page-header">
        <h1>Social Accounts</h1>
        <p className="subtitle">Manage your connected social media accounts.</p>
      </div>

      <div className="accounts-grid">
        {accounts.map(account => {
          const config = platformConfig[account.platform];
          return (
            <div key={account.id} className={`card account-card ${account.connected ? 'connected' : ''}`}>
              <div className="account-header" style={{ borderTopColor: config.color }}>
                <div className="account-icon" style={{ background: config.color }}>{config.icon}</div>
                <div className="account-info">
                  <h3>{config.name}</h3>
                  <span className="account-username">{account.username}</span>
                </div>
              </div>
              <div className="account-body">
                <span className="account-display">{account.displayName}</span>
                <span className={`connection-status ${account.connected ? 'connected' : 'disconnected'}`}>
                  {account.connected ? '● Connected' : '○ Disconnected'}
                </span>
              </div>
              <div className="account-footer">
                <button
                  className={`btn btn-sm ${account.connected ? 'btn-danger' : 'btn-primary'}`}
                  onClick={() => toggleAccount(account.id)}
                >
                  {account.connected ? 'Disconnect' : 'Connect'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
