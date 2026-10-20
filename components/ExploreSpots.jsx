'use client';

import { useEffect, useRef, useState } from 'react';
import PlaceImage from '@/components/PlaceImage';
import PlaceDetails from '@/components/PlaceDetails';
import { CATEGORIES } from '@/lib/categories';
import { fmtKm, fmtMin } from '@/lib/navigation';
import { approxMinutes } from '@/components/meet/tokens';
import m from '@/components/meet/Meet.module.css';
import x from './ExploreSpots.module.css';

const label = (id) => CATEGORIES.find((c) => c.id === id)?.label || 'Place';
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : null);
const cuisine = (p) => cap(p.cuisine?.split(';')[0].replace(/_/g, ' '));
const away = (p) => (p.distanceKm != null ? `${fmtKm(p.distanceKm)} · ${fmtMin(approxMinutes(p.distanceKm))}` : null);
// Saved Google photos are stored as a base link; ask for a small square.
const thumb = (u) => (u && /googleusercontent\.com|ggpht\.com/.test(u) ? `${u}=w320-h320-p-k-no` : u);

const BackIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 5.5 8.5 12l6.5 6.5" />
  </svg>
);

/**
 * One swipeable row of place cards. When a swipe settles, the card at the
 * start of the row is reported with onFocus (the map then moves to it); a
 * pin tapped on the map scrolls its card into view.
 */
function SpotRail({ title, places, loading, activeId, onFocus, onOpen, onExpand, expanded = false, external = false, empty }) {
  const [open, setAll] = useState(false);
  const all = expanded || open;
  // Closing the full-screen list folds the rows back up too.
  useEffect(() => {
    if (!expanded) setAll(false);
  }, [expanded]);
  const rail = useRef(null);
  const refs = useRef({});
  const fromSwipe = useRef(false);
  const timer = useRef(null);

  useEffect(() => {
    if (fromSwipe.current) {
      fromSwipe.current = false;
      return;
    }
    const el = activeId && refs.current[activeId];
    if (el && !all) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
  }, [activeId, all]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onScroll = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const box = rail.current;
      if (!box || !places?.length) return;
      const left = box.getBoundingClientRect().left;
      let best = null;
      for (const p of places) {
        const el = refs.current[p.id];
        if (!el) continue;
        const d = Math.abs(el.getBoundingClientRect().left - left - 16);
        if (!best || d < best.d) best = { p, d };
      }
      if (best && best.p.id !== activeId) {
        fromSwipe.current = true;
        onFocus(best.p);
      }
    }, 140);
  };

  return (
    <section className={x.section}>
      <div className={m.spotsHead}>
        <h2>{title}</h2>
        {places?.length > 1 && !expanded && (
          <button
            type="button"
            className={m.seeAll}
            onClick={() => {
              if (!external) setAll(!all);
              onExpand?.(!all);
            }}
            aria-expanded={all}
          >
            {all ? 'Show less' : 'See all'}
          </button>
        )}
      </div>

      {loading && (
        <div className={m.cards} aria-label="Finding places">
          <div className={m.skeleton} />
          <div className={m.skeleton} />
        </div>
      )}
      {!loading && !places?.length && empty}
      {!loading && places?.length > 0 && (
        <div ref={rail} className={`${m.cards} ${all ? m.cardsAll : ''}`} onScroll={all ? undefined : onScroll}>
          {places.map((p, i) => {
            const rated = p.rating != null;
            return (
              <article
                key={p.id}
                ref={(el) => (refs.current[p.id] = el)}
                className={`${m.spot} ${p.id === activeId ? m.spotOn : ''}`}
                style={{ animationDelay: `${Math.min(i, 6) * 50}ms` }}
                onClick={() => onFocus(p)}
              >
                <div className={`${m.spotImg} ${x.imgBox}`}>
                  {p.photo ? (
                    <img className={x.photo} src={thumb(p.photo)} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  ) : (
                    <PlaceImage
                      place={p}
                      size={92}
                      style={{ borderRadius: 12, height: '100%', minHeight: 92, background: 'var(--ember-soft)' }}
                    />
                  )}
                </div>
                <div className={m.spotBody}>
                  {rated ? (
                    <span className={m.tag}>
                      ★ {p.rating.toFixed(1)}
                      {p.price ? ` · ${p.price}` : ''}
                    </span>
                  ) : (
                    <span className={m.tagPlain}>{cuisine(p) || label(p.category)}</span>
                  )}
                  <span className={m.spotTitle}>{p.name}</span>
                  <span className={m.spotMeta}>
                    {[rated && (p.type || label(p.category)), away(p)].filter(Boolean).join(' · ') || label(p.category)}
                  </span>
                  <div className={m.spotFoot}>
                    <button
                      type="button"
                      className={m.pick}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpen(p);
                      }}
                    >
                      Take a look
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

/**
 * Explore: category chips, places we already have photos and reviews for,
 * then everything nearby. "Take a look" opens a place's details in the same
 * sheet. Only already-loaded places and saved info are used — nothing here
 * spends a search.
 */
export default function ExploreSpots({
  featured,
  places,
  loading,
  error,
  cats,
  onCats,
  title,
  activeId,
  onFocus,
  openId,
  onOpen,
  onClose,
  onShare,
  canWiden,
  onWiden,
  onExpand,
  expanded = false,
  seeAllOpensPage = false,
}) {
  const open = openId ? [...(featured || []), ...(places || [])].find((p) => p.id === openId) : null;
  // Places with good reviews nearby, best first.
  const topRated = (featured || []).filter((p) => p.rating >= 4).sort((a, b) => b.rating - a.rating);

  if (open) {
    return (
      <div className={x.detail}>
        <div className={x.detailHead}>
          <button type="button" className={`${x.back} hw-press`} onClick={onClose} aria-label="Back to places">
            <BackIcon />
          </button>
          <div className={x.detailTitle}>
            <h2>{open.name}</h2>
            <p>
              {[open.type || label(open.category), cuisine(open), open.distanceKm != null && `${fmtKm(open.distanceKm)} away`]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>

        {open.street && <p className={x.line}>{open.street}</p>}
        {open.openingHours && <p className={x.line}>{open.openingHours}</p>}

        <PlaceDetails
          place={open}
          savedOnly
          fallback={
            <PlaceImage
              place={open}
              size={160}
              style={{ borderRadius: 14, width: '100%', height: 160, background: 'var(--ember-soft)' }}
            />
          }
        />

        <div className={x.actions}>
          <a
            className={`${m.pick} ${x.go}`}
            href={`https://www.google.com/maps/dir/?api=1&destination=${open.lat},${open.lng}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Let&apos;s go here
          </a>
          <button type="button" className={`${x.share} hw-press`} onClick={() => onShare(open)}>
            Share with friends
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {topRated.length > 0 && (
        <SpotRail title="Top rated around you" places={topRated} activeId={activeId} onFocus={onFocus} onOpen={onOpen} onExpand={onExpand} external={seeAllOpensPage} />
      )}

      <SpotRail
        title={title}
        places={error ? [] : places}
        loading={loading}
        activeId={activeId}
        onFocus={onFocus}
        onOpen={onOpen}
        onExpand={onExpand}
        expanded={expanded}
        external={seeAllOpensPage}
        empty={
          error ? (
            <p className={m.empty}>{error}</p>
          ) : places ? (
            <div className={x.emptyRow}>
              <p className={m.empty}>
                {cats.length ? 'Nothing in these categories nearby — try another.' : 'Pick a category to see places.'}
              </p>
              {canWiden && cats.length > 0 && (
                <button type="button" className={m.seeAll} onClick={onWiden}>
                  Look further
                </button>
              )}
            </div>
          ) : null
        }
      />
    </>
  );
}
