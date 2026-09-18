import React from 'react';
import { MediaItem } from '../types';

export default function MediaThumb({ item }: { item: MediaItem }) {
  return item.mime.startsWith('video/')
    ? <video className="media-thumb" src={item.url} muted preload="metadata" />
    : <img className="media-thumb" src={item.url} alt={item.name} loading="lazy" />;
}
