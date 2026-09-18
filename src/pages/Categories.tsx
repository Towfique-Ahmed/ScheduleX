import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

const PALETTE = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#8b5cf6', '#64748b'];

export default function Categories() {
  const { categories, posts, createCategory, deleteCategory } = useApp();
  const [name, setName] = useState('');
  const [color, setColor] = useState(PALETTE[0]);
  const [error, setError] = useState<string | null>(null);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await createCategory(name.trim(), color); setName(''); setError(null); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not create category'); }
  };

  const evergreen = posts.filter(p => p.evergreen && p.status !== 'draft' && !p.recycledFrom);

  return (
    <div>
      <div className="page-header">
        <h1>Categories</h1>
        <p className="subtitle">Group posts by theme, and mark evergreen posts to recycle them automatically.</p>
      </div>

      <div className="card">
        <div className="card-header"><h2>Your categories</h2></div>
        <form className="inline-form" onSubmit={add}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Blog posts, Promotions" maxLength={40} aria-label="Category name" />
          <div className="swatches" role="radiogroup" aria-label="Color">
            {PALETTE.map(c => (
              <button type="button" key={c} role="radio" aria-checked={color === c} aria-label={c}
                className={`swatch ${color === c ? 'selected' : ''}`} style={{ background: c }} onClick={() => setColor(c)} />
            ))}
          </div>
          <button className="btn btn-primary btn-sm" disabled={!name.trim()}>Add</button>
        </form>
        {error && <div className="field-error" role="alert">{error}</div>}
        {categories.length === 0 ? (
          <div className="empty-state"><p>No categories yet.</p></div>
        ) : (
          <ul className="category-list">
            {categories.map(c => (
              <li key={c.id}>
                <span className="cat-dot" style={{ background: c.color }} />
                <span className="cat-name">{c.name}</span>
                <span className="cat-count">{posts.filter(p => p.categoryId === c.id).length} posts</span>
                <button className="btn btn-sm btn-danger" onClick={() => { if (confirm(`Delete "${c.name}"? Posts keep their content but lose this category.`)) void deleteCategory(c.id); }}>Delete</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header"><h2>Evergreen recycling</h2></div>
        <p className="hint" style={{ marginTop: 0 }}>
          Posts marked evergreen are copied back into the queue after their interval and published again. Turn it on per post in the composer.
        </p>
        {evergreen.length === 0 ? (
          <div className="empty-state"><p>No evergreen posts yet.</p></div>
        ) : (
          <ul className="category-list">
            {evergreen.map(p => (
              <li key={p.id}>
                <span className="cat-name">{p.content.slice(0, 70)}</span>
                <span className="cat-count">every {p.evergreen!.everyDays} days</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
