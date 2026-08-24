import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Header() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  return (
    <header className="header">
      <div className="header-search">
        <span className="search-icon">🔍</span>
        <input
          type="text"
          placeholder="Search posts, accounts..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="header-actions">
        <button className="btn btn-primary" onClick={() => navigate('/compose')}>
          + New Post
        </button>
        <button className="btn-icon" title="Notifications">🔔</button>
      </div>
    </header>
  );
}
