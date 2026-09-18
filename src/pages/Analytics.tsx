import React from 'react';
import { useApp } from '../context/AppContext';
import { platformConfig, formatNumber } from '../utils/platforms';

export default function Analytics() {
  const { analytics } = useApp();

  const totalFollowers = analytics.reduce((sum, a) => sum + a.followers, 0);
  const avgEngagement = (analytics.length ? analytics.reduce((sum, a) => sum + a.engagement, 0) / analytics.length : 0).toFixed(1);
  const totalImpressions = analytics.reduce((sum, a) => sum + a.impressions, 0);
  const totalClicks = analytics.reduce((sum, a) => sum + a.clicks, 0);

  return (
    <div className="analytics-page">
      <div className="page-header">
        <h1>Analytics</h1>
        <p className="subtitle">Track your social media performance across platforms.</p>
      </div>

      <div className="notice notice-info">
        Live platform metrics aren't wired up yet, so these figures are placeholders. Real per-account analytics are planned next.
      </div>

      <div className="stats-grid">
        <div className="stat-card accent-blue">
          <div className="stat-info">
            <span className="stat-value">{formatNumber(totalFollowers)}</span>
            <span className="stat-label">Total Followers</span>
          </div>
        </div>
        <div className="stat-card accent-green">
          <div className="stat-info">
            <span className="stat-value">{avgEngagement}%</span>
            <span className="stat-label">Avg Engagement</span>
          </div>
        </div>
        <div className="stat-card accent-purple">
          <div className="stat-info">
            <span className="stat-value">{formatNumber(totalImpressions)}</span>
            <span className="stat-label">Total Impressions</span>
          </div>
        </div>
        <div className="stat-card accent-orange">
          <div className="stat-info">
            <span className="stat-value">{formatNumber(totalClicks)}</span>
            <span className="stat-label">Total Clicks</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h2>Platform Breakdown</h2></div>
        <div className="analytics-table">
          <div className="table-header">
            <span>Platform</span>
            <span>Followers</span>
            <span>Engagement</span>
            <span>Impressions</span>
            <span>Clicks</span>
            <span>Trend</span>
          </div>
          {analytics.map(a => (
            <div key={a.platform} className="table-row">
              <span className="table-platform">
                <span className="platform-badge" style={{ background: platformConfig[a.platform].color }}>
                  {platformConfig[a.platform].icon}
                </span>
                {platformConfig[a.platform].name}
              </span>
              <span>{formatNumber(a.followers)}</span>
              <span>{a.engagement}%</span>
              <span>{formatNumber(a.impressions)}</span>
              <span>{formatNumber(a.clicks)}</span>
              <span className={`trend ${a.trend >= 0 ? 'up' : 'down'}`}>
                {a.trend >= 0 ? '↑' : '↓'} {Math.abs(a.trend)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h2>Engagement Chart</h2></div>
        <div className="chart-container">
          {analytics.map(a => (
            <div key={a.platform} className="chart-bar-group">
              <div className="chart-bar-wrapper">
                <div
                  className="chart-bar"
                  style={{
                    height: `${(a.engagement / 8) * 100}%`,
                    background: platformConfig[a.platform].color,
                  }}
                />
              </div>
              <span className="chart-label">{platformConfig[a.platform].icon}</span>
              <span className="chart-value">{a.engagement}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
