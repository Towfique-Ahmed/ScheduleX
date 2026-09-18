import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import MediaPicker from '../components/MediaPicker';
import MediaThumb from '../components/MediaThumb';
import { platformConfig } from '../utils/platforms';
import { dayKey, nextFreeSlot } from '../utils/queue';

type When = 'now' | 'later' | 'queue';

export default function Compose() {
  const { id } = useParams();
  const { accounts, posts, media, categories, slots, createPost, updatePost } = useApp();
  const navigate = useNavigate();
  const editing = id ? posts.find(p => p.id === id) : undefined;

  const [content, setContent] = useState('');
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [mediaIds, setMediaIds] = useState<string[]>([]);
  const [categoryId, setCategoryId] = useState<string>('');
  const [evergreen, setEvergreen] = useState(false);
  const [everyDays, setEveryDays] = useState(30);
  const [when, setWhen] = useState<When>('now');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [picking, setPicking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load an existing post into the form once (edit mode).
  const [loadedId, setLoadedId] = useState<string | null>(null);
  useEffect(() => {
    if (!editing || loadedId === editing.id) return;
    setLoadedId(editing.id);
    setContent(editing.content);
    setSelectedAccounts(editing.accounts);
    setMediaIds(editing.mediaIds);
    setCategoryId(editing.categoryId ?? '');
    setEvergreen(!!editing.evergreen);
    setEveryDays(editing.evergreen?.everyDays ?? 30);
    if (editing.scheduledAt) {
      const d = new Date(editing.scheduledAt);
      setWhen('later');
      setScheduleDate(dayKey(d));
      setScheduleTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
    }
  }, [editing, loadedId]);

  const connectedAccounts = accounts.filter(a => a.connected);
  const selected = connectedAccounts.filter(a => selectedAccounts.includes(a.id));
  const selectedPlatforms = [...new Set(selected.map(a => a.platform))];
  const attached = mediaIds.map(mid => media.find(m => m.id === mid)).filter((m): m is NonNullable<typeof m> => !!m);

  const limit = selectedPlatforms.length > 0 ? Math.min(...selectedPlatforms.map(p => platformConfig[p].maxChars)) : 280;
  const overLimit = content.length > limit;

  const queueSlot = useMemo(
    () => nextFreeSlot(slots, posts.filter(p => p.id !== id)),
    [slots, posts, id],
  );
  const laterIncomplete = when === 'later' && (!scheduleDate || !scheduleTime);
  const queueUnavailable = when === 'queue' && !queueSlot;

  const toggleAccount = (aid: string) => setSelectedAccounts(p => (p.includes(aid) ? p.filter(x => x !== aid) : [...p, aid]));
  const scheduledAt = () =>
    when === 'queue' ? queueSlot!.toISOString() : new Date(`${scheduleDate}T${scheduleTime}`).toISOString();

  const submit = async (action: 'draft' | 'schedule' | 'publish') => {
    setSubmitting(true);
    setError(null);
    const fields = {
      content,
      accounts: selectedAccounts,
      mediaIds,
      categoryId: categoryId || null,
      evergreen: evergreen ? { everyDays } : null,
    };
    try {
      if (editing) {
        await updatePost(editing.id, { ...fields, action, ...(action === 'schedule' ? { scheduledAt: scheduledAt() } : {}) });
      } else {
        await createPost({ ...fields, action, ...(action === 'schedule' ? { scheduledAt: scheduledAt() } : {}) });
      }
      navigate('/posts');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setSubmitting(false);
    }
  };

  if (id && !editing) {
    return <div className="card empty-state"><p>Post not found. <Link to="/posts">Back to posts</Link></p></div>;
  }
  if (editing && (editing.status === 'published' || editing.status === 'publishing')) {
    return <div className="card empty-state"><p>Published posts can't be edited. <Link to="/posts">Back to posts</Link></p></div>;
  }

  const action: 'schedule' | 'publish' = when === 'now' ? 'publish' : 'schedule';
  const primaryLabel = submitting ? 'Working…'
    : when === 'now' ? '🚀 Publish Now'
    : when === 'queue' ? '🗓 Add to Queue' : '📅 Schedule Post';

  return (
    <div className="compose">
      <div className="page-header">
        <h1>{editing ? 'Edit Post' : 'Create Post'}</h1>
        <p className="subtitle">Compose and schedule your content across platforms.</p>
      </div>

      <div className="compose-layout">
        <div className="compose-main">
          <div className="card">
            <div className="card-header"><h2>Post to</h2></div>
            {connectedAccounts.length === 0 ? (
              <div className="empty-state"><p>No connected accounts. <Link to="/accounts">Connect an account</Link> to start posting.</p></div>
            ) : (
              <div className="platform-selector">
                {connectedAccounts.map(account => {
                  const config = platformConfig[account.platform];
                  const on = selectedAccounts.includes(account.id);
                  return (
                    <button key={account.id} className={`platform-btn ${on ? 'selected' : ''}`}
                      style={on ? { borderColor: config.color, background: config.color + '15' } : {}}
                      onClick={() => toggleAccount(account.id)} aria-pressed={on}>
                      <span className="platform-btn-icon" style={{ background: config.color }}>{config.icon}</span>
                      <span className="platform-btn-name">{account.displayName}</span>
                      <span className="platform-btn-user">{config.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-header">
              <h2>Content</h2>
              <span className={`char-count ${overLimit ? 'over' : ''}`}>{content.length} / {limit}</span>
            </div>
            <textarea className="compose-textarea" placeholder="What's on your mind? Write your post here..." value={content} onChange={e => setContent(e.target.value)} rows={6} />
            {attached.length > 0 && (
              <div className="attached-media">
                {attached.map(m => (
                  <div key={m.id} className="attached-item">
                    <MediaThumb item={m} />
                    <button className="attached-remove" aria-label={`Remove ${m.name}`} onClick={() => setMediaIds(p => p.filter(x => x !== m.id))}>×</button>
                  </div>
                ))}
              </div>
            )}
            <div className="compose-toolbar">
              <button className="toolbar-btn" onClick={() => setPicking(true)}>🖼️ Media{mediaIds.length ? ` (${mediaIds.length})` : ''}</button>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><h2>Organize</h2></div>
            <div className="form-row">
              <label htmlFor="category">Category</label>
              <select id="category" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
                <option value="">None</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {categories.length === 0 && <Link to="/categories" className="hint">Create categories</Link>}
            </div>
            <div className="form-row">
              <label className="radio-option">
                <input type="checkbox" checked={evergreen} onChange={e => setEvergreen(e.target.checked)} />
                <span>Evergreen — re-post automatically every</span>
              </label>
              <input type="number" min={1} max={365} value={everyDays} disabled={!evergreen} onChange={e => setEveryDays(Math.min(365, Math.max(1, Number(e.target.value) || 1)))} className="num-input" aria-label="Days between reposts" />
              <span>days</span>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><h2>When</h2></div>
            <div className="schedule-options">
              {([['now', 'Publish Now'], ['later', 'Pick a date & time'], ['queue', 'Add to queue']] as const).map(([v, label]) => (
                <label key={v} className="radio-option">
                  <input type="radio" name="when" checked={when === v} onChange={() => setWhen(v)} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            {when === 'later' && (
              <div className="schedule-inputs">
                <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} />
                <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} />
              </div>
            )}
            {when === 'queue' && (
              <p className="hint">
                {queueSlot
                  ? <>Next free slot: <strong>{queueSlot.toLocaleString('en-US', { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</strong></>
                  : <>No open slots. <Link to="/queue">Set up your posting schedule</Link>.</>}
              </p>
            )}
          </div>
        </div>

        <div className="compose-preview">
          <div className="card">
            <div className="card-header"><h2>Preview</h2></div>
            <div className="preview-card">
              {selected.length === 0 ? (
                <div className="empty-state"><p>Select an account to see a preview</p></div>
              ) : (
                <div className="preview-content">
                  <div className="preview-header">
                    <div className="preview-avatar">
                      {selected[0].avatar
                        ? <img src={selected[0].avatar} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', borderRadius: 'inherit' }} />
                        : selected[0].displayName[0]}
                    </div>
                    <div><strong>{selected[0].displayName}</strong><span className="preview-time">Just now</span></div>
                  </div>
                  <p className="preview-text">{content || 'Your post content will appear here...'}</p>
                  {attached[0] && <div className="preview-media"><MediaThumb item={attached[0]} /></div>}
                  <div className="preview-platforms">
                    {selectedPlatforms.map(p => (
                      <span key={p} className="platform-tag" style={{ background: platformConfig[p].color }}>{platformConfig[p].icon} {platformConfig[p].name}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {error && <div className="notice notice-error" role="alert"><span>{error}</span></div>}
          {overLimit && <div className="notice notice-error"><span>Over the {limit}-character limit for one of the selected platforms.</span></div>}

          <div className="compose-actions">
            <button className="btn btn-outline" onClick={() => submit('draft')} disabled={!content.trim() || submitting}>Save Draft</button>
            <button className="btn btn-primary" onClick={() => submit(action)}
              disabled={!content.trim() || selected.length === 0 || overLimit || laterIncomplete || queueUnavailable || submitting}>
              {primaryLabel}
            </button>
          </div>
        </div>
      </div>

      {picking && <MediaPicker selected={mediaIds} onClose={() => setPicking(false)} onDone={ids => { setMediaIds(ids); setPicking(false); }} />}
    </div>
  );
}
