import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { DAY_NAMES, SUGGESTED_SLOTS, upcomingSlots } from '../utils/queue';

const fmt = (d: Date) => d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function Queue() {
  const { slots, posts, saveSlots } = useApp();
  const { can } = useAuth();
  const [day, setDay] = useState(1);
  const [time, setTime] = useState('09:00');
  const [error, setError] = useState<string | null>(null);

  const run = async (next: { day: number; time: string }[]) => {
    try { await saveSlots(next); setError(null); } catch (err) { setError(err instanceof Error ? err.message : 'Could not save'); }
  };
  const sorted = useMemo(() => [...slots].sort((a, b) => a.day - b.day || a.time.localeCompare(b.time)), [slots]);
  const scheduled = posts.filter(p => p.status === 'scheduled' && p.scheduledAt).sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!));
  const upcoming = upcomingSlots(slots).slice(0, 8);
  const taken = new Set(scheduled.map(p => Math.floor(new Date(p.scheduledAt!).getTime() / 60000)));

  return (
    <div>
      <div className="page-header">
        <h1>Queue</h1>
        <p className="subtitle">Set your weekly posting times once. Choose "Add to queue" when composing and each post takes the next free slot.</p>
      </div>
      {error && <div className="notice notice-error" role="alert"><span>{error}</span></div>}

      <div className="two-col">
        <div className="card">
          <div className="card-header"><h2>Posting schedule</h2></div>
          {can.manageSlots && <form className="inline-form" onSubmit={e => { e.preventDefault(); void run([...slots, { day, time }]); }}>
            <select value={day} onChange={e => setDay(Number(e.target.value))} aria-label="Day">
              {DAY_NAMES.map((n, i) => <option key={n} value={i}>{n}</option>)}
            </select>
            <input type="time" value={time} onChange={e => setTime(e.target.value)} required aria-label="Time" />
            <button className="btn btn-primary btn-sm">Add slot</button>
          </form>}
          {sorted.length === 0 ? (
            <div className="empty-state">
              <p>No posting times yet.</p>
              {can.manageSlots && <button className="btn btn-outline btn-sm" onClick={() => run(SUGGESTED_SLOTS)}>Use suggested weekday schedule</button>}
              <p className="hint">Weekdays at 9:00, 12:30 and 17:30. This is general guidance, not based on your audience data.</p>
            </div>
          ) : (
            <ul className="slot-list">
              {sorted.map(s => (
                <li key={s.id}>
                  <span>{DAY_NAMES[s.day]}</span><strong>{s.time}</strong>
                  {can.manageSlots && <button className="notice-close" aria-label={`Remove ${DAY_NAMES[s.day]} ${s.time}`} onClick={() => run(slots.filter(x => x.id !== s.id))}>×</button>}
                </li>
              ))}
            </ul>
          )}
          <p className="hint">Times use this browser's time zone ({Intl.DateTimeFormat().resolvedOptions().timeZone}).</p>
        </div>

        <div className="card">
          <div className="card-header"><h2>Upcoming slots</h2></div>
          {upcoming.length === 0 ? <div className="empty-state"><p>Add a posting time to see upcoming slots.</p></div> : (
            <ul className="slot-list">
              {upcoming.map(d => {
                const post = scheduled.find(p => Math.floor(new Date(p.scheduledAt!).getTime() / 60000) === Math.floor(d.getTime() / 60000));
                return (
                  <li key={d.toISOString()} className={taken.has(Math.floor(d.getTime() / 60000)) ? 'slot-taken' : 'slot-free'}>
                    <span>{fmt(d)}</span>
                    {post ? <Link to={`/compose/${post.id}`}>{post.content.slice(0, 40)}</Link> : <em>Open</em>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
