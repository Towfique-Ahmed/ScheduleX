import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { DailyBars, Sparkline } from '../components/charts';
import { formatNumber, platformConfig } from '../utils/platforms';
import { AnalyticsReport } from '../types';

const RANGES = [7, 30, 90] as const;
const fmt = (n?: number) => (n === undefined || n === null ? '—' : formatNumber(n));

export default function Analytics() {
  const { can } = useAuth();
  const [days, setDays] = useState<number>(30);
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => api.analytics(days).then(r => { setReport(r); setError(null); }).catch(e => setError(e.message)), [days]);
  useEffect(() => { void load(); }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    try { setReport(await api.refreshAnalytics(days)); setError(null); } catch (e) { setError(e instanceof Error ? e.message : 'Refresh failed'); }
    setRefreshing(false);
  };

  if (!report) return <div className="card empty-state"><p>{error ?? 'Loading analytics…'}</p></div>;
  const { publishing: p, audience } = report;

  return (
    <div className="analytics-page">
      <div className="page-header">
        <h1>Analytics</h1>
        <p className="subtitle">What ScheduleX published, and how your audiences are doing.</p>
      </div>
      {error && <div className="notice notice-error" role="alert"><span>{error}</span></div>}

      <div className="toolbar-row no-print">
        <div className="segmented" role="group" aria-label="Date range">
          {RANGES.map(r => <button key={r} className={days === r ? 'active' : ''} onClick={() => setDays(r)}>{r} days</button>)}
        </div>
        {can.approve && <>
          <button className="btn btn-sm btn-outline" onClick={refresh} disabled={refreshing}>{refreshing ? 'Refreshing…' : '↻ Refresh audience data'}</button>
          <a className="btn btn-sm btn-outline" href={`/api/reports/summary.csv?days=${days}&tz=${new Date().getTimezoneOffset()}`}>⬇ Export CSV</a>
        </>}
        <button className="btn btn-sm btn-outline" onClick={() => window.print()}>🖨 Print / PDF</button>
      </div>

      <div className="stats-grid">
        <div className="stat-card accent-green"><div className="stat-info"><span className="stat-value">{p.published}</span><span className="stat-label">Posts published</span></div></div>
        <div className="stat-card accent-red"><div className="stat-info"><span className="stat-value">{p.failed}</span><span className="stat-label">Failed</span></div></div>
        <div className="stat-card accent-blue"><div className="stat-info"><span className="stat-value">{p.successRate === null ? '—' : `${p.successRate}%`}</span><span className="stat-label">Success rate</span></div></div>
        <div className="stat-card accent-purple"><div className="stat-info"><span className="stat-value">{p.scheduled}</span><span className="stat-label">Scheduled ahead</span></div></div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header"><h2>Posts per day</h2><span className="hint">
          <span className="key key-ok" /> published <span className="key key-fail" /> failed
        </span></div>
        {p.published + p.failed === 0 ? <div className="empty-state"><p>Nothing published in this period yet.</p></div> : <DailyBars data={p.byDay} />}
      </div>

      <div className="two-col" style={{ marginTop: 20 }}>
        <div className="card">
          <div className="card-header"><h2>By platform</h2></div>
          {p.byPlatform.length === 0 ? <div className="empty-state"><p>No data yet.</p></div> : (
            <table className="data-table">
              <thead><tr><th>Platform</th><th className="num">Published</th><th className="num">Failed</th></tr></thead>
              <tbody>{p.byPlatform.map(r => <tr key={r.platform}><td>{platformConfig[r.platform].name}</td><td className="num">{r.published}</td><td className="num">{r.failed}</td></tr>)}</tbody>
            </table>
          )}
        </div>
        <div className="card">
          <div className="card-header"><h2>By category</h2></div>
          {p.byCategory.length === 0 ? <div className="empty-state"><p>Assign categories to posts to see a breakdown.</p></div> : (
            <table className="data-table">
              <thead><tr><th>Category</th><th className="num">Published</th></tr></thead>
              <tbody>{p.byCategory.map(r => <tr key={r.categoryId}><td>{r.name}</td><td className="num">{r.published}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      </div>

      <h2 className="section-title">Audience</h2>
      {audience.length === 0 ? <div className="card empty-state"><p>Connect an account to see audience data.</p></div> : (
        <div className="card">
          <table className="data-table">
            <thead><tr><th>Account</th><th className="num">Followers</th><th className="num">Change</th><th>Trend</th><th className="num">Impressions</th><th className="num">Engagements</th></tr></thead>
            <tbody>
              {audience.map(a => (
                <tr key={a.accountId}>
                  <td><strong>{a.displayName}</strong><br /><span className="hint">{platformConfig[a.platform].name}</span></td>
                  {!a.supported ? <td colSpan={5} className="hint">{a.note}</td>
                    : a.error && !a.latest ? <td colSpan={5} className="field-error">{a.error}</td>
                    : !a.latest ? <td colSpan={5} className="hint">No data yet. {can.approve ? 'Use “Refresh audience data”.' : 'An editor can refresh this.'}</td>
                    : <>
                      <td className="num">{fmt(a.latest.followers)}</td>
                      <td className={`num ${a.followerChange === null ? '' : a.followerChange >= 0 ? 'trend up' : 'trend down'}`}>
                        {a.followerChange === null ? '—' : `${a.followerChange >= 0 ? '+' : ''}${a.followerChange}`}
                      </td>
                      <td><Sparkline points={a.series.map(s => s.followers)} label={`${a.displayName} followers over time`} /></td>
                      <td className="num">{fmt(a.latest.impressions)}</td>
                      <td className="num">{fmt(a.latest.engagements)}</td>
                    </>}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint">Follower history builds up daily from when you connect. Impressions and engagements are the platform's own recent totals where its API provides them; a dash means the platform didn't return that number.</p>
        </div>
      )}
    </div>
  );
}
