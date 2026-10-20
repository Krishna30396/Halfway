'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import PlaceImage from '@/components/PlaceImage';
import { CATEGORIES } from '@/lib/categories';
import { haversine } from '@/lib/geo';
import { fmtKm, fmtMin } from '@/lib/navigation';
import { approxMinutes } from './tokens';
import m from './Meet.module.css';

const DEFAULT_CATS = ['cafe', 'restaurant'];
const label = (id) => CATEGORIES.find((c) => c.id === id)?.label || 'Place';
const minsTo = (from, p) => (from ? approxMinutes(haversine([from.lat, from.lng], [p.lat, p.lng])) : null);

/** Category filter chips ("All" + each category); multi-select like CategoryChips. */
export function MeetChips({ selected, onChange }) {
  const all = selected.length === CATEGORIES.length;
  const toggle = (id) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <div className={m.chips} role="group" aria-label="Place categories">
      <button
        type="button"
        className={all ? m.chipOn : m.chip}
        aria-pressed={all}
        onClick={() => onChange(all ? DEFAULT_CATS : CATEGORIES.map((c) => c.id))}
      >
        All
      </button>
      {CATEGORIES.map((c) => {
        const on = !all && selected.includes(c.id);
        return (
          <button
            key={c.id}
            type="button"
            className={on ? m.chipOn : m.chip}
            aria-pressed={on}
            onClick={() => (all ? onChange([c.id]) : toggle(c.id))}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * "Fair spots near halfway": horizontally scrolling place cards with a rough
 * travel time for both people and a "Pick this" (= suggest) button.
 */
export default function FairSpots({
  title = 'Fair spots near halfway',
  places,
  loading,
  cats,
  onCats,
  me,
  friend,
  friendName,
  meLetter,
  friendLetter,
  busy,
  onPick,
  selectedId,
  onSelect,
}) {
  const [all, setAll] = useState(false);
  const [picking, setPicking] = useState(null);
  const refs = useRef({});

  useEffect(() => {
    if (!busy) setPicking(null);
  }, [busy]);

  // Tapping a pin on the map brings its card into view.
  useEffect(() => {
    const el = selectedId && refs.current[selectedId];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
  }, [selectedId]);

  const rows = useMemo(() => {
    const list = (places || []).map((p) => {
      const mine = minsTo(me, p);
      const theirs = minsTo(friend, p);
      const both = mine != null && theirs != null;
      const fair = both && Math.abs(mine - theirs) <= Math.max(4, 0.25 * Math.max(mine, theirs));
      return { p, mine, theirs, fair, score: both ? Math.max(mine, theirs) + Math.abs(mine - theirs) / 2 : null };
    });
    // Fairest first when both positions are known; otherwise keep the search order.
    if (list.every((r) => r.score != null)) list.sort((a, b) => a.score - b.score);
    return list;
  }, [places, me?.lat, me?.lng, friend?.lat, friend?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const shortName = friendName?.replace(/^@/, '') || 'Friend';

  return (
    <>
      <MeetChips selected={cats} onChange={onCats} />

      <section>
        <div className={m.spotsHead}>
          <h2>{title}</h2>
          {rows.length > 1 && (
            <button type="button" className={m.seeAll} onClick={() => setAll((a) => !a)} aria-expanded={all}>
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
        {!loading && places?.length === 0 && (
          <p className={m.empty}>{cats.length ? 'Nothing in these categories nearby — try another.' : 'Pick a category to see places.'}</p>
        )}
        {!loading && rows.length > 0 && (
          <div className={`${m.cards} ${all ? m.cardsAll : ''}`}>
            {rows.map(({ p, mine, theirs, fair }, i) => {
              const isPicking = picking === p.id;
              return (
                <article
                  key={p.id}
                  ref={(el) => (refs.current[p.id] = el)}
                  className={`${m.spot} ${p.id === selectedId ? m.spotOn : ''}`}
                  style={{ animationDelay: `${Math.min(i, 6) * 50}ms` }}
                  onClick={() => onSelect?.(p.id)}
                >
                  <div className={m.spotImg}>
                    <PlaceImage
                      place={p}
                      size={92}
                      style={{ borderRadius: 12, height: '100%', minHeight: 92, background: 'var(--ember-soft)' }}
                    />
                  </div>
                  <div className={m.spotBody}>
                    <span className={fair ? m.tag : m.tagPlain}>{fair ? 'Fair for both' : label(p.category)}</span>
                    <span className={m.spotTitle}>{p.name}</span>
                    <span className={m.spotMeta}>
                      {mine != null || theirs != null
                        ? [mine != null && `You ~${fmtMin(mine)}`, theirs != null && `${shortName} ~${fmtMin(theirs)}`]
                            .filter(Boolean)
                            .join(' · ')
                        : p.distanceKm != null
                          ? `${fmtKm(p.distanceKm)} from halfway`
                          : label(p.category)}
                    </span>
                    <div className={m.spotFoot}>
                      <button
                        type="button"
                        className={`${m.pick} ${isPicking ? m.picking : ''}`}
                        disabled={busy}
                        onClick={(e) => {
                          e.stopPropagation();
                          setPicking(p.id);
                          onPick(p);
                        }}
                      >
                        {isPicking && busy ? 'Sending…' : 'Pick this'}
                      </button>
                      <span className={m.stack} aria-hidden="true">
                        <span className={m.stackMe}>{meLetter}</span>
                        <span className={m.stackFriend}>{friendLetter}</span>
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
