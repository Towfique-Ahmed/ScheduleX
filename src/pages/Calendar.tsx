import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { platformConfig } from '../utils/platforms';
import { dayKey } from '../utils/queue';
import { Post } from '../types';

type View = 'month' | 'week';

const editableStatus = (p: Post) => p.status === 'draft' || p.status === 'scheduled' || p.status === 'failed';
const when = (p: Post) => new Date(p.scheduledAt ?? p.publishedAt ?? p.createdAt);
const timeLabel = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

export default function Calendar() {
  const { posts, categories, slots, updatePost } = useApp();
  const navigate = useNavigate();
  const { user, can } = useAuth();
  // Contributors can open their own drafts; only editors can move things around on the calendar.
  const editable = (p: Post) => editableStatus(p) && (can.publishDirectly || (p.createdBy === user!.id && p.status === 'draft'));
  const draggable = (p: Post) => editableStatus(p) && can.publishDirectly;
  const [view, setView] = useState<View>('month');
  const [cursor, setCursor] = useState(new Date());
  const [dragId, setDragId] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  const catColor = (p: Post) => categories.find(c => c.id === p.categoryId)?.color;
  const drafts = posts.filter(p => p.status === 'draft');

  const byDay = useMemo(() => {
    const map = new Map<string, Post[]>();
    for (const p of posts) {
      if (p.status === 'draft') continue;
      const k = dayKey(when(p));
      map.set(k, [...(map.get(k) ?? []), p]);
    }
    for (const list of map.values()) list.sort((a, b) => when(a).getTime() - when(b).getTime());
    return map;
  }, [posts]);

  // ---- Navigation
  const today = new Date();
  const step = (dir: 1 | -1) =>
    setCursor(view === 'month'
      ? new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1)
      : new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 7 * dir));

  const weekStart = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - cursor.getDay());
  const weekDays = Array.from({ length: 7 }, (_, i) => new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i));
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthDays: (Date | null)[] = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(cursor.getFullYear(), cursor.getMonth(), i - first.getDay() + 1);
    return d.getMonth() === cursor.getMonth() ? d : null;
  });

  // ---- Drag and drop
  const reschedule = async (postId: string, day: Date, time?: string) => {
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    const target = new Date(day);
    if (time) {
      const [h, m] = time.split(':').map(Number);
      target.setHours(h, m, 0, 0);
    } else if (post.scheduledAt) {
      const old = new Date(post.scheduledAt);
      target.setHours(old.getHours(), old.getMinutes(), 0, 0);
    } else {
      const daySlot = slots.filter(s => s.day === day.getDay()).sort((a, b) => a.time.localeCompare(b.time))[0];
      const [h, m] = (daySlot?.time ?? '09:00').split(':').map(Number);
      target.setHours(h, m, 0, 0);
    }
    if (target.getTime() < Date.now()) {
      setNotice({ kind: 'error', text: `${target.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} is in the past. Pick a later time.` });
      return;
    }
    try {
      await updatePost(postId, { scheduledAt: target.toISOString() });
      setNotice({ kind: 'success', text: `Scheduled for ${target.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.` });
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not reschedule' });
    }
  };

  const dropProps = (key: string, day: Date, time?: string) => ({
    onDragOver: (e: React.DragEvent) => { if (dragId) { e.preventDefault(); setOverKey(key); } },
    onDragLeave: () => setOverKey(k => (k === key ? null : k)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const id = dragId ?? e.dataTransfer.getData('text/plain');
      setOverKey(null);
      setDragId(null);
      if (id) void reschedule(id, day, time);
    },
  });

  const chip = (p: Post) => {
    const d = when(p);
    const color = catColor(p);
    return (
      <div
        key={p.id}
        className={`cell-post cal-chip status-${p.status} ${dragId === p.id ? 'dragging' : ''}`}
        style={color ? { borderLeft: `3px solid ${color}` } : undefined}
        draggable={draggable(p)}
        onDragStart={e => { e.dataTransfer.setData('text/plain', p.id); e.dataTransfer.effectAllowed = 'move'; setDragId(p.id); }}
        onDragEnd={() => { setDragId(null); setOverKey(null); }}
        onClick={() => navigate(editable(p) ? `/compose/${p.id}` : '/posts')}
        title={`${p.content}\n\n${draggable(p) ? 'Drag to reschedule · click to edit' : editable(p) ? 'Click to edit' : p.status === 'pending_approval' ? 'Awaiting approval' : 'Published'}`}
        role="button" tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter') navigate(editable(p) ? `/compose/${p.id}` : '/posts'); }}
      >
        {p.platforms.map(pl => <span key={pl} className="cell-dot" style={{ background: platformConfig[pl].color }} />)}
        <span className="cell-text">{timeLabel(d)} · {p.content.substring(0, view === 'week' ? 60 : 18)}</span>
      </div>
    );
  };

  const title = view === 'month'
    ? cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : `${weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  const isToday = (d: Date) => dayKey(d) === dayKey(today);

  return (
    <div className="calendar-page">
      <div className="page-header">
        <h1>Calendar</h1>
        <p className="subtitle">{can.publishDirectly ? 'Drag posts to reschedule them. Drag a draft onto a day to schedule it.' : 'Your team’s scheduled content.'}</p>
      </div>

      {notice && (
        <div className={`notice notice-${notice.kind}`} role="status">
          <span>{notice.text}</span>
          <button className="notice-close" aria-label="Dismiss" onClick={() => setNotice(null)}>×</button>
        </div>
      )}

      {can.publishDirectly && drafts.length > 0 && (
        <div className="card draft-tray">
          <div className="card-header"><h2>Unscheduled drafts</h2></div>
          <div className="tray-items">
            {drafts.map(p => (
              <div key={p.id} className="tray-chip" draggable
                onDragStart={e => { e.dataTransfer.setData('text/plain', p.id); e.dataTransfer.effectAllowed = 'move'; setDragId(p.id); }}
                onDragEnd={() => { setDragId(null); setOverKey(null); }}
                onClick={() => navigate(`/compose/${p.id}`)} title="Drag onto a day to schedule">
                {p.content.substring(0, 40)}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="calendar-header">
          <button className="btn btn-sm" onClick={() => step(-1)}>← Prev</button>
          <h2>{title}</h2>
          <div className="cal-controls">
            <div className="segmented" role="group" aria-label="View">
              {(['month', 'week'] as const).map(v => (
                <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>{v === 'month' ? 'Month' : 'Week'}</button>
              ))}
            </div>
            <button className="btn btn-sm" onClick={() => setCursor(new Date())}>Today</button>
            <button className="btn btn-sm" onClick={() => step(1)}>Next →</button>
          </div>
        </div>

        {view === 'month' ? (
          <div className="calendar-grid">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d} className="calendar-day-header">{d}</div>)}
            {monthDays.map((d, i) => {
              if (!d) return <div key={i} className="calendar-cell empty" />;
              const key = dayKey(d);
              return (
                <div key={key} className={`calendar-cell ${isToday(d) ? 'today' : ''} ${overKey === key ? 'drop-over' : ''}`} {...dropProps(key, d)}>
                  <span className="cell-day">{d.getDate()}</span>
                  <div className="cell-posts">{(byDay.get(key) ?? []).map(chip)}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="week-grid">
            {weekDays.map(d => {
              const key = dayKey(d);
              const dayPosts = byDay.get(key) ?? [];
              const taken = new Set(dayPosts.map(p => { const w = when(p); return `${String(w.getHours()).padStart(2, '0')}:${String(w.getMinutes()).padStart(2, '0')}`; }));
              const openSlots = slots.filter(s => s.day === d.getDay() && !taken.has(s.time)).sort((a, b) => a.time.localeCompare(b.time));
              return (
                <div key={key} className={`week-col ${isToday(d) ? 'today' : ''} ${overKey === key ? 'drop-over' : ''}`} {...dropProps(key, d)}>
                  <div className="week-col-head">
                    <span>{d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                    <strong>{d.getDate()}</strong>
                  </div>
                  <div className="week-col-body">
                    {dayPosts.map(chip)}
                    {openSlots.map(s => {
                      const sk = `${key}@${s.time}`;
                      const past = new Date(`${key}T${s.time}`).getTime() < Date.now();
                      return (
                        <div key={s.id} className={`slot-target ${overKey === sk ? 'drop-over' : ''} ${past ? 'past' : ''}`} {...dropProps(sk, d, s.time)}>
                          {s.time} · open slot
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
