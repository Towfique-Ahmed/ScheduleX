import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import MediaThumb from './MediaThumb';
import UploadButton from './UploadButton';

export default function MediaPicker({ selected, onDone, onClose }: { selected: string[]; onDone: (ids: string[]) => void; onClose: () => void }) {
  const { media } = useApp();
  const [picked, setPicked] = useState<string[]>(selected);
  const toggle = (id: string) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal card" role="dialog" aria-modal="true" aria-label="Choose media" onClick={e => e.stopPropagation()}>
        <div className="card-header">
          <h2>Choose media</h2>
          <UploadButton onUploaded={items => setPicked(p => [...p, ...items.map(i => i.id)])} />
        </div>
        {media.length === 0 ? (
          <div className="empty-state"><p>Your library is empty. Upload an image to get started.</p></div>
        ) : (
          <div className="media-grid">
            {media.map(m => (
              <button key={m.id} className={`media-tile ${picked.includes(m.id) ? 'selected' : ''}`} onClick={() => toggle(m.id)} aria-pressed={picked.includes(m.id)}>
                <MediaThumb item={m} />
                {picked.includes(m.id) && <span className="media-check">✓</span>}
              </button>
            ))}
          </div>
        )}
        <div className="modal-actions">
          <button className="btn btn-outline btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={() => onDone(picked)}>Attach {picked.length || ''}</button>
        </div>
      </div>
    </div>
  );
}
