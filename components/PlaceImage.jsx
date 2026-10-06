'use client';

import { useEffect, useState } from 'react';
import { placeholderFor } from '@/lib/placeholders';

function buildPhotoUrl(place) {
  if (place.imageTag?.startsWith('http')) return place.imageTag;
  if (place.wikimediaCommons) {
    const clean = place.wikimediaCommons.replace(/^File:/, '').replace(/ /g, '_');
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(clean)}?width=400`;
  }
  return null;
}

export default function PlaceImage({ place, size = 56, className, style }) {
  const [src, setSrc] = useState(() => buildPhotoUrl(place));
  const [failed, setFailed] = useState(false);
  const [wdLoading, setWdLoading] = useState(false);

  useEffect(() => {
    const direct = buildPhotoUrl(place);
    if (direct) {
      setSrc(direct);
      setFailed(false);
      return;
    }
    if (place.wikidata) {
      setWdLoading(true);
      fetch(`/api/photo?wikidata=${place.wikidata}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.url) { setSrc(d.url); setFailed(false); }
          else setFailed(true);
        })
        .catch(() => setFailed(true))
        .finally(() => setWdLoading(false));
      return;
    }
    setFailed(true);
  }, [place.imageTag, place.wikimediaCommons, place.wikidata]);

  const placeholder = placeholderFor(place.category);

  if (failed || (!src && !wdLoading)) {
    return (
      <div
        className={className}
        style={{
          width: size,
          height: size,
          borderRadius: 8,
          background: placeholder.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size * 0.42,
          flexShrink: 0,
          ...style,
        }}
        aria-hidden="true"
      >
        {placeholder.emoji}
      </div>
    );
  }

  if (wdLoading) {
    return (
      <div
        className={className}
        style={{
          width: size,
          height: size,
          borderRadius: 8,
          background: 'var(--contour)',
          flexShrink: 0,
          ...style,
        }}
        aria-hidden="true"
      />
    );
  }

  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      className={className}
      onError={() => setFailed(true)}
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        objectFit: 'cover',
        flexShrink: 0,
        background: 'var(--contour)',
        ...style,
      }}
    />
  );
}
