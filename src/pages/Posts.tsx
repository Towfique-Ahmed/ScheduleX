import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { platformConfig } from '../utils/platforms';
import { PostStatus } from '../types';

const statusLabels: Record<PostStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'status-draft' },
  scheduled: { label: 'Scheduled', className: 'status-scheduled' },
  publishing: { label: 'Publishing…', className: 'status-scheduled' },
  published: { label: 'Published', className: 'status-published' },
  failed: { label: 'Failed', className: 'status-failed' },
};

export default function Posts() {
  const { posts, accounts, categories, deletePost, retryPost } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const accountName = (id: string) => accounts.find(a => a.id === id)?.displayName ?? 'Disconnected account';
  const [filter, setFilter] = useState<PostStatus | 'all'>('all');

  const filtered = filter === 'all' ? posts : posts.filter(p => p.status === filter);

  return (
    <div className="posts-page">
      <div className="page-header">
        <h1>Posts</h1>
        <p className="subtitle">Manage all your social media posts.</p>
      </div>

      <div className="filter-bar">
        {(['all', 'draft', 'scheduled', 'published', 'failed'] as const).map(status => (
          <button
            key={status}
            className={`filter-btn ${filter === status ? 'active' : ''}`}
            onClick={() => setFilter(status)}
          >
            {status === 'all' ? 'All' : statusLabels[status].label}
            <span className="filter-count">
              {status === 'all' ? posts.length : posts.filter(p => p.status === status).length}
            </span>
          </button>
        ))}
      </div>

      <div className="posts-list">
        {filtered.length === 0 ? (
          <div className="card empty-state"><p>No posts found.</p></div>
        ) : (
          filtered.map(post => (
            <div key={post.id} className="card post-card">
              <div className="post-card-header">
                <div className="post-platforms">
                  {post.platforms.map(p => (
                    <span key={p} className="platform-badge-sm" style={{ background: platformConfig[p].color }}>
                      {platformConfig[p].icon}
                    </span>
                  ))}
                </div>
                <span className={`status-badge ${statusLabels[post.status].className}`}>
                  {statusLabels[post.status].label}
                </span>
              </div>
              <p className="post-card-content">{post.content}</p>
              {(post.categoryId || post.evergreen || post.mediaIds.length > 0) && (
                <div className="post-tags">
                  {post.categoryId && <span className="tag">{categories.find(c => c.id === post.categoryId)?.name ?? 'Category'}</span>}
                  {post.evergreen && <span className="tag">♻ every {post.evergreen.everyDays}d</span>}
                  {post.recycledFrom && <span className="tag">Recycled</span>}
                  {post.mediaIds.length > 0 && <span className="tag">🖼 {post.mediaIds.length}</span>}
                </div>
              )}
              {post.results.length > 0 && (
                <ul className="post-results">
                  {post.results.map(r => (
                    <li key={r.accountId} className={r.status === 'failed' ? 'result-failed' : 'result-ok'}>
                      {r.status === 'published' ? '✓' : '✕'} {accountName(r.accountId)}
                      {r.url && <> — <a href={r.url} target="_blank" rel="noreferrer">View post</a></>}
                      {r.error && <> — {r.error}</>}
                    </li>
                  ))}
                </ul>
              )}
              <div className="post-card-footer">
                <span className="post-date">
                  {post.scheduledAt
                    ? `Scheduled: ${new Date(post.scheduledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                    : `Created: ${new Date(post.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                  }
                </span>
                <div className="post-card-actions">
                  {post.status !== 'published' && post.status !== 'publishing' && (
                    <Link to={`/compose/${post.id}`} className="btn btn-sm btn-outline">Edit</Link>
                  )}
                  {post.status === 'failed' && (
                    <button
                      className="btn btn-sm btn-primary"
                      disabled={busy === post.id}
                      onClick={async () => { setBusy(post.id); try { await retryPost(post.id); } finally { setBusy(null); } }}
                    >
                      Retry
                    </button>
                  )}
                  <button className="btn btn-sm btn-danger" onClick={() => { if (confirm('Delete this post?')) void deletePost(post.id); }}>Delete</button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
