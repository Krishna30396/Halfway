'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './PlaceDetails.module.css';

// One fetch per place per visit; the server keeps results for everyone.
const cache = new Map();

function load(place, savedOnly) {
  const id = String(place.id);
  const key = savedOnly ? `saved:${id}` : id;
  if (!cache.has(key)) {
    const q = savedOnly
      ? new URLSearchParams({ key: id, saved: '1' })
      : new URLSearchParams({ key: id, name: place.name, lat: place.lat, lng: place.lng, cat: place.category || '' });
    cache.set(
      key,
      fetch(`/api/place-info?${q}`)
        .then((r) => r.json())
        .catch(() => ({ status: 'error' }))
        .then((d) => {
          if (d.status !== 'ok') cache.delete(key); // try again on the next open
          return d;
        })
    );
  }
  return cache.get(key);
}

// Photos are stored as one base link; Google serves any size from it.
const GOOGLE_IMG = /googleusercontent\.com|ggpht\.com/;
const sized = (p) => {
  if (typeof p !== 'string') return p; // older saved shape
  const u = p;
  if (!GOOGLE_IMG.test(u) || /=[^/=]*$/.test(u.split('/').pop())) return { thumb: u, full: u };
  return { thumb: `${u}=w320-h320-p-k-no`, full: `${u}=w1600-h1600-k-no` };
};

const stars = (n) => '★'.repeat(Math.round(n || 0)) + '☆'.repeat(5 - Math.round(n || 0));

/**
 * Google rating, price, photos (with a Menu tab) and recent reviews for a
 * place, shown inside the app. `onResize` lets the map popup re-fit.
 * `savedOnly` shows what is already saved and never spends a search.
 */
export default function PlaceDetails({ place, fallback, onResize, savedOnly = false }) {
  const [res, setRes] = useState(null);
  const [tab, setTab] = useState('photos');
  const [menu, setMenu] = useState(null); // null | 'loading' | { photos } | { status }
  const [allReviews, setAllReviews] = useState(false);
  const [revs, setRevs] = useState(null); // null | 'loading' | { reviews } | { status }
  const [viewer, setViewer] = useState(null); // { list, index }
  const touchX = useRef(null);

  useEffect(() => {
    let live = true;
    setRes(null);
    setTab('photos');
    setMenu(null);
    setAllReviews(false);
    setRevs(null);
    load(place, savedOnly).then((d) => live && setRes(d));
    return () => {
      live = false;
    };
  }, [place.id, savedOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    onResize?.();
  }, [res, tab, menu, allReviews, revs]); // eslint-disable-line react-hooks/exhaustive-deps

  // The next two photos load while you look at this one, so swiping is instant.
  useEffect(() => {
    if (!viewer) return;
    for (const i of [viewer.index + 1, viewer.index + 2]) {
      const p = viewer.list[i];
      if (p) new Image().src = p.full;
    }
  }, [viewer]);

  const step = (d) =>
    setViewer((v) => (v && v.index + d >= 0 && v.index + d < v.list.length ? { ...v, index: v.index + d } : v));

  // Keyboard for the photo viewer: Esc closes, arrows step through.
  useEffect(() => {
    if (!viewer) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setViewer(null);
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewer]);

  const info = res?.status === 'ok' ? res.info : null;

  const openMenu = () => {
    setTab('menu');
    if (menu || !info) return;
    if (info.menuPhotos) return setMenu({ photos: info.menuPhotos });
    setMenu('loading');
    fetch(`/api/place-info?menu=1&key=${encodeURIComponent(String(place.id))}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.status === 'ok') info.menuPhotos = d.photos;
        setMenu(d.status === 'ok' ? { photos: d.photos } : { status: d.status });
      })
      .catch(() => setMenu({ status: 'error' }));
  };

  // Reviews are fetched the first time someone asks, then kept for everyone.
  const openReviews = () => {
    if (revs || !info) return;
    setRevs('loading');
    fetch(`/api/place-info?reviews=1&key=${encodeURIComponent(String(place.id))}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.status === 'ok') info.reviews = d.reviews;
        setRevs(d.status === 'ok' ? { reviews: d.reviews } : { status: d.status });
      })
      .catch(() => setRevs({ status: 'error' }));
  };

  const strip = (raw) => {
    const list = raw.map(sized);
    return (
    <div className={styles.strip}>
      {list.map((p, i) => (
        <button
          key={p.thumb}
          type="button"
          className={styles.thumb}
          onClick={() => setViewer({ list, index: i })}
          aria-label={`Open photo ${i + 1} of ${list.length}`}
        >
          <img src={p.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" />
        </button>
      ))}
    </div>
    );
  };

  // Still loading: a quiet skeleton where the photos will go.
  if (!res) {
    return (
      <div className={styles.wrap}>
        <div className={styles.skeleton} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p className={styles.note}>Getting photos and reviews…</p>
      </div>
    );
  }

  if (!info) {
    return (
      <div className={styles.wrap}>
        {fallback}
        {res.status === 'later' && <p className={styles.note}>Photos and reviews for new places will be back tomorrow.</p>}
      </div>
    );
  }

  const photos = info.photos || [];
  const reviews = info.reviews || revs?.reviews || [];
  const reviewsUnknown = !info.reviews && !revs?.reviews && !!info.dataId;
  const shownReviews = allReviews ? reviews : reviews.slice(0, 2);

  return (
    <div className={styles.wrap}>
      {info.rating != null && (
        <div className={styles.rating}>
          <strong>{info.rating.toFixed(1)}</strong>
          <span className={styles.stars} aria-hidden="true">{stars(info.rating)}</span>
          {info.reviewCount != null && <span>({Number(info.reviewCount).toLocaleString('en-IN')})</span>}
          {info.price && <span className={styles.price}>{info.price}</span>}
        </div>
      )}
      {info.hours && <div className={styles.hours}>{info.hours}</div>}

      {(photos.length > 0 || info.menuCategory) && (
        <>
          <div className={styles.tabs} role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'photos'} className={tab === 'photos' ? styles.tabOn : styles.tab} onClick={() => setTab('photos')}>
              Photos{photos.length ? ` · ${photos.length}` : ''}
            </button>
            {info.menuCategory && (
              <button type="button" role="tab" aria-selected={tab === 'menu'} className={tab === 'menu' ? styles.tabOn : styles.tab} onClick={openMenu}>
                Menu
              </button>
            )}
          </div>
          {tab === 'photos' && (photos.length ? strip(photos) : fallback)}
          {tab === 'menu' &&
            (menu === 'loading' || menu === null ? (
              <div className={styles.skeleton} aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            ) : menu.photos?.length ? (
              strip(menu.photos)
            ) : (
              <p className={styles.note}>
                {menu.status === 'later' ? 'The menu will be available tomorrow.' : 'No menu photos for this place yet.'}
              </p>
            ))}
        </>
      )}
      {!photos.length && !info.menuCategory && fallback}

      {reviews.length > 0 && (
        <div className={styles.reviews}>
          {shownReviews.map((r, i) => (
            <div key={i} className={styles.review}>
              <div className={styles.reviewHead}>
                <strong>{r.name}</strong>
                <span className={styles.stars} aria-label={`${r.rating} out of 5`}>{stars(r.rating)}</span>
                <span className={styles.when}>{r.date}</span>
              </div>
              {r.text && <p>{r.text}</p>}
            </div>
          ))}
          {reviews.length > 2 && (
            <button type="button" className={styles.more} onClick={() => setAllReviews((v) => !v)}>
              {allReviews ? 'Show fewer reviews' : `Show all ${reviews.length} reviews`}
            </button>
          )}
        </div>
      )}
      {reviewsUnknown &&
        (revs === 'loading' ? (
          <p className={styles.note}>Getting reviews…</p>
        ) : revs?.status ? (
          <p className={styles.note}>
            {revs.status === 'later' ? 'Reviews will be available tomorrow.' : 'No reviews for this place yet.'}
          </p>
        ) : (
          <button type="button" className={styles.more} onClick={openReviews}>
            Show reviews
          </button>
        ))}
      <p className={styles.credit}>Rating, photos and reviews from Google</p>

      {viewer &&
        createPortal(
          <div
            className={styles.viewer}
            role="dialog"
            aria-label="Photo"
            onClick={() => setViewer(null)}
            onTouchStart={(e) => {
              touchX.current = e.touches[0].clientX;
            }}
            onTouchEnd={(e) => {
              if (touchX.current == null) return;
              const dx = e.changedTouches[0].clientX - touchX.current;
              touchX.current = null;
              if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
            }}
          >
            <img
              src={viewer.list[viewer.index].full}
              alt=""
              referrerPolicy="no-referrer"
              onClick={(e) => e.stopPropagation()}
            />
            <span className={styles.count}>
              {viewer.index + 1} / {viewer.list.length}
            </span>
            <button type="button" className={styles.close} aria-label="Close" onClick={() => setViewer(null)}>
              ✕
            </button>
            {viewer.index > 0 && (
              <button
                type="button"
                className={styles.prev}
                aria-label="Previous photo"
                onClick={(e) => {
                  e.stopPropagation();
                  step(-1);
                }}
              >
                ‹
              </button>
            )}
            {viewer.index < viewer.list.length - 1 && (
              <button
                type="button"
                className={styles.next}
                aria-label="Next photo"
                onClick={(e) => {
                  e.stopPropagation();
                  step(1);
                }}
              >
                ›
              </button>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
