import React from 'react';
import { useApp } from '../context/AppContext';
import { platformConfig, formatNumber } from '../utils/platforms';
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const { posts, analytics, accounts } = useApp();
  const navigate = useNavigate();

  const scheduled = posts.filter(p => p.status === 'scheduled');
  const published = posts.filter(p => p.status === 'published');
  const drafts = posts.filter(p => p.status === 'draft');
  const connectedAccounts = accounts.filter(a => a.connected);

  return (
    <div className="dashboard">
      <div className="page-header">
        <h1>Dashboard</h1>
        <p className="subtitle">Welcome back! Here's your social media overview.</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon scheduled">📅</div>
          <div className="stat-info">
            <span className="stat-value">{scheduled.length}</span>
            <span className="stat-label">Scheduled</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon published">✅</div>
          <div className="stat-info">
            <span className="stat-value">{published.length}</span>
            <span className="stat-label">Published</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon drafts">📝</div>
          <div className="stat-info">
            <span className="stat-value">{drafts.length}</span>
            <span className="stat-label">Drafts</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon accounts">🔗</div>
          <div className="stat-info">
            <span className="stat-value">{connectedAccounts.length}</span>
            <span className="stat-label">Connected</span>
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="card">
          <div className="card-header">
            <h2>Platform Performance</h2>
          </div>
          <div className="analytics-list">
            {analytics.map(a => (
              <div key={a.platform} className="analytics-row">
                <div className="platform-badge" style={{ background: platformConfig[a.platform].color }}>
                  {platformConfig[a.platform].icon}
                </div>
                <div className="analytics-info">
                  <span className="analytics-name">{platformConfig[a.platform].name}</span>
                  <span className="analytics-followers">{formatNumber(a.followers)} followers</span>
                </div>
                <div className="analytics-engagement">
                  <span className="engagement-value">{a.engagement}%</span>
                  <span className={`trend ${a.trend >= 0 ? 'up' : 'down'}`}>
                    {a.trend >= 0 ? '↑' : '↓'} {Math.abs(a.trend)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2>Upcoming Posts</h2>
            <button className="btn btn-sm" onClick={() => navigate('/posts')}>View All</button>
          </div>
          <div className="upcoming-posts">
            {scheduled.length === 0 ? (
              <div className="empty-state">
                <p>No scheduled posts</p>
                <button className="btn btn-primary btn-sm" onClick={() => navigate('/compose')}>Create Post</button>
              </div>
            ) : (
              scheduled.slice(0, 3).map(post => (
                <div key={post.id} className="post-preview">
                  <p className="post-content">{post.content.substring(0, 80)}...</p>
                  <div className="post-meta">
                    <div className="post-platforms">
                      {post.platforms.map(p => (
                        <span key={p} className="platform-dot" style={{ background: platformConfig[p].color }} title={platformConfig[p].name} />
                      ))}
                    </div>
                    <span className="post-time">
                      {post.scheduledAt ? new Date(post.scheduledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
