import React from 'react';
import { NavLink } from 'react-router-dom';

const navItems = [
  { path: '/', label: 'Dashboard', icon: '📊' },
  { path: '/compose', label: 'Create Post', icon: '✏️' },
  { path: '/posts', label: 'Posts', icon: '📝' },
  { path: '/calendar', label: 'Calendar', icon: '📅' },
  { path: '/queue', label: 'Queue', icon: '🗓️' },
  { path: '/library', label: 'Media Library', icon: '🖼️' },
  { path: '/categories', label: 'Categories', icon: '🏷️' },
  { path: '/analytics', label: 'Analytics', icon: '📈' },
  { path: '/accounts', label: 'Accounts', icon: '👥' },
];

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="logo-icon">⚡</span>
        <span className="logo-text">ScheduleX</span>
      </div>
      <nav className="sidebar-nav">
        {navItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div className="user-info">
          <div className="user-avatar">T</div>
          <div className="user-details">
            <span className="user-name">Towfique</span>
            <span className="user-plan">Pro Plan</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
