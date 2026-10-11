'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './PlaceDetails.module.css';

// One fetch per place per visit; the server keeps results for everyone.
const cache = new Map();

function load(place) {
  const key = String(place.id);
  if (!cache.has(key)) {
    const q = new URLSearchParams({ key, name: place.name, lat: place.lat, lng: place.lng });
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

const stars = (n) => '★'.repeat(Math.round(n || 0)) + '☆'.repeat(5 - Math.round(n || 0));

/**
 * Google rating, price, photos (with a Menu tab) and recent reviews for a
 * place, shown inside the app. `onResize` lets the map popup re-fit.
 */
export default function PlaceDetails({ place, fallback, onResize }) {
  const [res, setRes] = useState(null);
  const [tab, setTab] = useState('photos');
  const [menu, setMenu] = useState(null); // null | 'loading' | { photos } | { status }
  const [allReviews, setAllReviews] = useState(false);
  const [viewer, setViewer] = useState(null); // { list, index }

  useEffect(() => {
    let live = true;
    setRes(null);
    setTab('photos');
    setMenu(null);
    setAllReviews(false);
    load(place).then((d) => live && setRes(d));
    return () => {
      live = false;
    };
  }, [place.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    onResize?.();
  }, [res, tab, menu, allReviews]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard for the photo viewer: Esc closes, arrows step through.
  useEffect(() => {
    if (!viewer) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setViewer(null);
      if (e.key === 'ArrowRight') setViewer((v) => (v && v.index < v.list.length - 1 ? { ...v, index: v.index + 1 } : v));
      if (e.key === 'ArrowLeft') setViewer((v) => (v && v.index > 0 ? { ...v, index: v.index - 1 } : v));
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

  const strip = (list) => (
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
  const reviews = info.reviews || [];
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
      <p className={styles.credit}>Rating, photos and reviews from Google</p>

      {viewer &&
        createPortal(
          <div className={styles.viewer} role="dialog" aria-label="Photo" onClick={() => setViewer(null)}>
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
                  setViewer((v) => ({ ...v, index: v.index - 1 }));
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
                  setViewer((v) => ({ ...v, index: v.index + 1 }));
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
