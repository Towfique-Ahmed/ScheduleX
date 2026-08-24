import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { platformConfig } from '../utils/platforms';
import { Platform } from '../types';
import { useNavigate } from 'react-router-dom';

export default function Compose() {
  const { accounts, addPost } = useApp();
  const navigate = useNavigate();
  const [content, setContent] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [isScheduling, setIsScheduling] = useState(false);

  const connectedAccounts = accounts.filter(a => a.connected);

  const togglePlatform = (platform: Platform) => {
    setSelectedPlatforms(prev =>
      prev.includes(platform) ? prev.filter(p => p !== platform) : [...prev, platform]
    );
    const acct = connectedAccounts.find(a => a.platform === platform);
    if (acct) {
      setSelectedAccounts(prev =>
        prev.includes(acct.id) ? prev.filter(id => id !== acct.id) : [...prev, acct.id]
      );
    }
  };

  const minChars = selectedPlatforms.length > 0
    ? Math.min(...selectedPlatforms.map(p => platformConfig[p].maxChars))
    : 280;

  const handlePublish = (status: 'draft' | 'scheduled' | 'published') => {
    if (!content.trim() || selectedPlatforms.length === 0) return;
    let scheduledAt: string | null = null;
    if (status === 'scheduled' && scheduleDate && scheduleTime) {
      scheduledAt = new Date(`${scheduleDate}T${scheduleTime}`).toISOString();
    }
    addPost({
      content,
      platforms: selectedPlatforms,
      scheduledAt,
      status,
      mediaUrls: [],
      accounts: selectedAccounts,
    });
    navigate('/posts');
  };

  return (
    <div className="compose">
      <div className="page-header">
        <h1>Create Post</h1>
        <p className="subtitle">Compose and schedule your content across platforms.</p>
      </div>

      <div className="compose-layout">
        <div className="compose-main">
          <div className="card">
            <div className="card-header"><h2>Select Platforms</h2></div>
            <div className="platform-selector">
              {connectedAccounts.map(account => {
                const config = platformConfig[account.platform];
                const selected = selectedPlatforms.includes(account.platform);
                return (
                  <button
                    key={account.id}
                    className={`platform-btn ${selected ? 'selected' : ''}`}
                    style={selected ? { borderColor: config.color, background: config.color + '15' } : {}}
                    onClick={() => togglePlatform(account.platform)}
                  >
                    <span className="platform-btn-icon" style={{ background: config.color }}>{config.icon}</span>
                    <span className="platform-btn-name">{config.name}</span>
                    <span className="platform-btn-user">{account.username}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h2>Content</h2>
              <span className={`char-count ${content.length > minChars ? 'over' : ''}`}>
                {content.length} / {minChars}
              </span>
            </div>
            <textarea
              className="compose-textarea"
              placeholder="What's on your mind? Write your post here..."
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={6}
            />
            <div className="compose-toolbar">
              <button className="toolbar-btn" title="Add Image">🖼️ Media</button>
              <button className="toolbar-btn" title="Add Emoji">😊 Emoji</button>
              <button className="toolbar-btn" title="Add Hashtag"># Hashtag</button>
              <button className="toolbar-btn" title="AI Assist">✨ AI Assist</button>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><h2>Schedule</h2></div>
            <div className="schedule-options">
              <label className="radio-option">
                <input type="radio" checked={!isScheduling} onChange={() => setIsScheduling(false)} />
                <span>Publish Now</span>
              </label>
              <label className="radio-option">
                <input type="radio" checked={isScheduling} onChange={() => setIsScheduling(true)} />
                <span>Schedule for Later</span>
              </label>
            </div>
            {isScheduling && (
              <div className="schedule-inputs">
                <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} />
                <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} />
              </div>
            )}
          </div>
        </div>

        <div className="compose-preview">
          <div className="card">
            <div className="card-header"><h2>Preview</h2></div>
            <div className="preview-card">
              {selectedPlatforms.length === 0 ? (
                <div className="empty-state"><p>Select platforms to see preview</p></div>
              ) : (
                <div className="preview-content">
                  <div className="preview-header">
                    <div className="preview-avatar">S</div>
                    <div>
                      <strong>ScheduleX</strong>
                      <span className="preview-time">Just now</span>
                    </div>
                  </div>
                  <p className="preview-text">{content || 'Your post content will appear here...'}</p>
                  <div className="preview-platforms">
                    {selectedPlatforms.map(p => (
                      <span key={p} className="platform-tag" style={{ background: platformConfig[p].color }}>
                        {platformConfig[p].icon} {platformConfig[p].name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="compose-actions">
            <button className="btn btn-outline" onClick={() => handlePublish('draft')} disabled={!content.trim()}>
              Save Draft
            </button>
            <button
              className="btn btn-primary"
              onClick={() => handlePublish(isScheduling ? 'scheduled' : 'published')}
              disabled={!content.trim() || selectedPlatforms.length === 0}
            >
              {isScheduling ? '📅 Schedule Post' : '🚀 Publish Now'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
