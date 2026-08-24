import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { platformConfig } from '../utils/platforms';

export default function Calendar() {
  const { posts } = useApp();
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const days = Array.from({ length: 42 }, (_, i) => {
    const day = i - firstDay + 1;
    if (day < 1 || day > daysInMonth) return null;
    return day;
  });

  const getPostsForDay = (day: number) => {
    return posts.filter(p => {
      const date = p.scheduledAt ? new Date(p.scheduledAt) : new Date(p.createdAt);
      return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day;
    });
  };

  const prev = () => setCurrentDate(new Date(year, month - 1, 1));
  const next = () => setCurrentDate(new Date(year, month + 1, 1));
  const today = new Date();
  const isToday = (day: number) => day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  return (
    <div className="calendar-page">
      <div className="page-header">
        <h1>Calendar</h1>
        <p className="subtitle">Visual overview of your scheduled content.</p>
      </div>

      <div className="card">
        <div className="calendar-header">
          <button className="btn btn-sm" onClick={prev}>← Prev</button>
          <h2>{currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2>
          <button className="btn btn-sm" onClick={next}>Next →</button>
        </div>

        <div className="calendar-grid">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="calendar-day-header">{d}</div>
          ))}
          {days.map((day, i) => (
            <div key={i} className={`calendar-cell ${day ? '' : 'empty'} ${day && isToday(day) ? 'today' : ''}`}>
              {day && (
                <>
                  <span className="cell-day">{day}</span>
                  <div className="cell-posts">
                    {getPostsForDay(day).map(post => (
                      <div key={post.id} className="cell-post" title={post.content}>
                        {post.platforms.map(p => (
                          <span key={p} className="cell-dot" style={{ background: platformConfig[p].color }} />
                        ))}
                        <span className="cell-text">{post.content.substring(0, 20)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
