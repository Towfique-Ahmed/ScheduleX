import React, { useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { MediaItem } from '../types';

export default function UploadButton({ onUploaded, className = 'btn btn-primary btn-sm' }: { onUploaded?: (items: MediaItem[]) => void; className?: string }) {
  const { uploadMedia } = useApp();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    setBusy(true);
    setError(null);
    const done: MediaItem[] = [];
    for (const f of files) {
      try { done.push(await uploadMedia(f)); }
      catch (err) { setError(`${f.name}: ${err instanceof Error ? err.message : 'upload failed'}`); }
    }
    setBusy(false);
    if (done.length) onUploaded?.(done);
  };

  return (
    <>
      <input ref={input} type="file" multiple hidden accept="image/jpeg,image/png,image/gif,image/webp,video/mp4" onChange={onChange} />
      <button className={className} disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Uploading…' : '⬆ Upload'}</button>
      {error && <span className="field-error" role="alert">{error}</span>}
    </>
  );
}
