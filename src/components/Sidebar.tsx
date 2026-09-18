import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { ROLE_LABELS } from '../utils/roles';

export default function Sidebar() {
  const { user, can, logout } = useAuth();
  const { posts } = useApp();
  const pending = posts.filter(p => p.status === 'pending_approval').length;

  const navItems = [
    { path: '/', label: 'Dashboard', icon: '📊' },
    ...(can.draft ? [{ path: '/compose', label: 'Create Post', icon: '✏️' }] : []),
    { path: '/posts', label: 'Posts', icon: '📝' },
    ...(can.approve ? [{ path: '/approvals', label: 'Approvals', icon: '✅', badge: pending }] : []),
    { path: '/calendar', label: 'Calendar', icon: '📅' },
    { path: '/queue', label: 'Queue', icon: '🗓️' },
    { path: '/library', label: 'Media Library', icon: '🖼️' },
    { path: '/categories', label: 'Categories', icon: '🏷️' },
    { path: '/analytics', label: 'Analytics', icon: '📈' },
    { path: '/accounts', label: 'Accounts', icon: '👥' },
    ...(can.manageMembers ? [{ path: '/team', label: 'Team', icon: '🤝' }] : []),
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="logo-icon">⚡</span>
        <span className="logo-text">ScheduleX</span>
      </div>
      <nav className="sidebar-nav">
        {navItems.map(item => (
          <NavLink key={item.path} to={item.path} end={item.path === '/'} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
            {'badge' in item && item.badge ? <span className="nav-badge">{item.badge}</span> : null}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div className="user-info">
          <div className="user-avatar">{user!.name[0]?.toUpperCase()}</div>
          <div className="user-details">
            <span className="user-name">{user!.name}</span>
            <span className="user-plan">{ROLE_LABELS[user!.role].label}</span>
          </div>
          <button className="signout" onClick={() => void logout()} title="Sign out" aria-label="Sign out">⎋</button>
        </div>
      </div>
    </aside>
  );
}
