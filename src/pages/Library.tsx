import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import MediaThumb from '../components/MediaThumb';
import UploadButton from '../components/UploadButton';

const size = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default function Library() {
  const { media, posts, deleteMedia } = useApp();
  const { can } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const usage = (id: string) => posts.filter(p => p.mediaIds.includes(id)).length;

  const remove = async (id: string, name: string) => {
    if (!confirm(`Delete ${name}?`)) return;
    try { await deleteMedia(id); setError(null); } catch (err) { setError(err instanceof Error ? err.message : 'Could not delete'); }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Media Library</h1>
        <p className="subtitle">Upload images once and reuse them across posts.</p>
      </div>
      {can.draft && <div className="toolbar-row"><UploadButton /></div>}
      {error && <div className="notice notice-error" role="alert"><span>{error}</span></div>}
      {media.length === 0 ? (
        <div className="card empty-state"><p>No media yet. Upload JPG, PNG, GIF, WebP or MP4 files (up to 25 MB).</p></div>
      ) : (
        <div className="media-grid media-grid-lg">
          {media.map(m => (
            <div key={m.id} className="card media-card">
              <MediaThumb item={m} />
              <div className="media-meta">
                <span className="media-name" title={m.name}>{m.name}</span>
                <span className="media-sub">{size(m.size)} · used in {usage(m.id)} post{usage(m.id) === 1 ? '' : 's'}</span>
              </div>
              {can.deleteMedia && <button className="btn btn-sm btn-danger" onClick={() => remove(m.id, m.name)}>Delete</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
