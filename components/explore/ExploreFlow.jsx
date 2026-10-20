'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  TILES,
  TILE_BY_ID,
  answer,
  chipsOf,
  choose,
  currentCard,
  flowOf,
  initial,
  jump,
  keepSwiping,
  photoFor,
  photosOf,
  progress,
  resultOf,
  startTile,
  surpriseTile,
  undo,
} from '@/lib/exploreFlows';
import styles from './ExploreFlow.module.css';

const COACH_KEY = 'hw.explore.coach.v1';
const STATE_KEY = 'hw.explore.state.v1';
const NUDGE_KEY = 'hw.explore.nudged';
const DIRS = ['right', 'left', 'up'];
const STAMP = { right: 'Yes', left: 'Nope', up: "Either's fine" };

const store = {
  get(k, session) {
    try {
      return (session ? sessionStorage : localStorage).getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v, session) {
    try {
      (session ? sessionStorage : localStorage).setItem(k, v);
    } catch {}
  },
};

const buzz = (p) => {
  try {
    navigator.vibrate?.(p);
  } catch {}
};

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Explore: first-visit tips → six tiles → swipe cards → your pick.
 * `onPick(result)` hands the answers to Search (see resultOf in lib/exploreFlows).
 */
export default function ExploreFlow({ onPick }) {
  const [state, setState] = useState(() => initial(true));
  const [ready, setReady] = useState(false);
  const [replayTips, setReplayTips] = useState(false);
  const [live, setLive] = useState('');
  const stateRef = useRef(state);
  stateRef.current = state;

  // Restore after mount (storage isn't there on the server).
  useEffect(() => {
    const seen = store.get(COACH_KEY) === '1';
    let s = initial(seen);
    try {
      const saved = JSON.parse(store.get(STATE_KEY, true) || 'null');
      if (saved && saved.phase && saved.phase !== 'coach' && (!saved.tile || TILE_BY_ID[saved.tile])) s = { ...s, ...saved, past: saved.past || [] };
    } catch {}
    setState(s);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    store.set(STATE_KEY, JSON.stringify({ ...state, past: state.past.slice(-30) }), true);
  }, [state, ready]);

  // "?" in the header shows the tips again.
  useEffect(() => {
    const show = () => setReplayTips(true);
    window.addEventListener('hw:explore-tips', show);
    return () => window.removeEventListener('hw:explore-tips', show);
  }, []);

  /* ---------- Phone back: one card back, not out of the app ---------- */
  const guard = useRef(false);
  const pending = useRef(null);
  const tipsOpen = state.phase === 'coach' || replayTips;
  const needsGuard = ready && (state.phase !== 'tiles' || replayTips);
  useEffect(() => {
    if (needsGuard && !guard.current) {
      history.pushState({ hwExplore: 1 }, '');
      guard.current = true;
    }
  }, [needsGuard, state]);
  useEffect(() => {
    const onPop = () => {
      if (!guard.current) return;
      guard.current = false;
      if (pending.current) {
        const run = pending.current;
        pending.current = null;
        run();
        return;
      }
      if (replayTipsRef.current) return setReplayTips(false);
      const s = stateRef.current;
      if (s.phase === 'coach') return finishTips();
      setState(s.past.length ? undo(s) : { ...s, phase: 'tiles' });
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      if (guard.current) {
        guard.current = false;
        history.back();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const replayTipsRef = useRef(false);
  replayTipsRef.current = replayTips;

  // Run `fn` once our history entry is gone, so Search starts from a clean URL.
  const leave = (fn) => {
    if (guard.current) {
      pending.current = fn;
      history.back();
    } else fn();
  };

  const finishTips = useCallback(() => {
    store.set(COACH_KEY, '1');
    setReplayTips(false);
    setState((s) => (s.phase === 'coach' ? { ...s, phase: 'tiles' } : s));
  }, []);

  const card = currentCard(state);
  const tile = TILE_BY_ID[state.tile];

  // Announce each new card for screen readers.
  useEffect(() => {
    if (state.phase === 'cards' && card) {
      const p = progress(state);
      setLive(`Step ${p.index} of ${p.total}, ${card.step.eyebrow.toLowerCase()}: ${cardTitle(card)}`);
    } else if (state.phase === 'done') setLive(`${endTitle(resultOf(state))} Show me places.`);
    else if (state.phase === 'grid') setLive('Not feeling any of these? Pick one, or type what you want.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, card?.step?.id, card?.option?.id, card?.type]);

  // Warm every photo of the tile as soon as it's picked.
  useEffect(() => {
    if (!state.tile) return;
    for (const src of photosOf(state.tile)) if (src) new Image().src = src;
  }, [state.tile]);

  const act = (fn) => setState((s) => fn(s));

  let body;
  if (!ready) body = null;
  else if (state.phase === 'coach' || state.phase === 'tiles') {
    body = (
      <Tiles
        onTile={(id) => act((s) => startTile(s, id))}
        onSurprise={() => {
          const pick = surpriseTile();
          act((s) => startTile(s, pick.id, pick.note));
        }}
      />
    );
  } else if (state.phase === 'grid') {
    body = (
      <NothingFits
        state={state}
        card={card}
        onChoose={(stepId, v) => act((s) => choose(s, stepId, v))}
        onKeep={() => act(keepSwiping)}
        onRestart={() => act((s) => ({ ...s, phase: 'tiles' }))}
      />
    );
  } else if (state.phase === 'done') {
    const result = resultOf(state);
    body = (
      <EndCard
        state={state}
        result={result}
        onGo={() => leave(() => onPick?.(result))}
        onRestart={() => act((s) => ({ ...s, phase: 'tiles' }))}
      />
    );
  } else {
    body = <Deck state={state} card={card} onAnswer={(dir) => act((s) => answer(s, dir))} />;
  }

  const showBar = ready && state.tile && state.phase !== 'tiles' && state.phase !== 'coach';

  return (
    <div className={styles.flow} data-fill>
      {showBar && (
        <SelectionsBar
          state={state}
          tile={tile}
          onTile={() => act((s) => ({ ...s, phase: 'tiles', past: [...s.past, { ...s, past: undefined }] }))}
          onJump={(id) => act((s) => jump(s, id))}
        />
      )}
      {body}
      {ready && tipsOpen && <Tips onDone={finishTips} />}
      <p className={styles.srOnly} aria-live="polite">
        {live}
      </p>
    </div>
  );
}

const cardTitle = (card) =>
  card.type === 'option' ? card.option.title : card.type === 'fallback' ? card.step.fallback.title : card.step.title;
const cardLine = (card) =>
  card.type === 'option' ? card.option.line : card.type === 'fallback' ? card.step.fallback.line : card.step.line;
const endTitle = (r) => (/[.!?]$/.test(r.end) ? r.end : r.end === 'Game on' ? 'Game on.' : `${r.end} it is.`);

/* ---------- Tiles ---------- */

function Tiles({ onTile, onSurprise }) {
  return (
    <div className={`${styles.screen} ${styles.tilesScreen}`}>
      <div className={styles.intro}>
        <h2 className={styles.h2}>What are we up to today?</h2>
        <p className={styles.sub}>Pick one and we&apos;ll handle the rest.</p>
      </div>
      <div className={styles.tiles}>
        {TILES.map((t, i) => (
          <button key={t.id} type="button" className={`${styles.tile} hw-press`} style={{ '--i': i }} onClick={() => onTile(t.id)}>
            <img src={t.photo} alt="" />
            <span className={styles.tileLabel}>
              {t.label}
              {t.note && <small className={styles.tileNote}>{t.note}</small>}
            </span>
          </button>
        ))}
      </div>
      <button type="button" className={`${styles.surprise} hw-press`} onClick={onSurprise} aria-label="Surprise me: we'll pick for you">
        <DiceIcon />
        Surprise me
      </button>
    </div>
  );
}

/* ---------- Selections bar ---------- */

function SelectionsBar({ state, tile, onTile, onJump }) {
  const chips = chipsOf(state);
  const card = state.phase === 'cards' ? currentCard(state) : null;
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTo({ left: el.scrollWidth, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [chips.length, card?.step?.id]);
  return (
    <nav className={styles.bar} aria-label="Your picks so far" ref={ref}>
      <button type="button" className={`${styles.chip} ${styles.chipTile}`} onClick={onTile} aria-label={`${tile.label}, tap to pick something else`}>
        {tile.label}
      </button>
      {chips.map((c) => (
        <button
          key={`${c.step}:${c.label}`}
          type="button"
          className={`${styles.chip} ${c.any ? styles.chipAny : ''} ${card && (card.step.id === c.jumpTo || card.step.id === `${c.jumpTo}2`) ? styles.chipEditing : ''}`}
          onClick={() => onJump(c.jumpTo)}
          aria-label={`${c.label}, tap to change`}
        >
          {c.label}
        </button>
      ))}
      {card && !chips.some((c) => card.step.id === c.jumpTo || card.step.id === `${c.jumpTo}2`) && (
        <span className={`${styles.chip} ${styles.chipNow}`} aria-current="step">
          {card.step.eyebrow}
        </span>
      )}
    </nav>
  );
}

/* ---------- The deck ---------- */

function Deck({ state, card, onAnswer }) {
  const p = progress(state);
  const photo = photoFor(state, card);
  const behind = useMemo(() => behindPhoto(state, card), [state, card]);
  const cardKey = `${card?.step?.id}:${card?.option?.id || card?.type}`;
  const swipe = useSwipe(onAnswer, cardKey);
  const [nudge, setNudge] = useState(false);

  // One gentle wiggle on the very first card, so nobody misses that it moves.
  useEffect(() => {
    if (store.get(NUDGE_KEY, true) || reducedMotion()) return;
    const t = setTimeout(() => {
      setNudge(true);
      store.set(NUDGE_KEY, '1', true);
    }, 1200);
    return () => clearTimeout(t);
  }, []);

  // Arrow keys answer, unless someone is typing.
  useEffect(() => {
    const onKey = (e) => {
      const map = { ArrowRight: 'right', ArrowLeft: 'left', ArrowUp: 'up' };
      const dir = map[e.key];
      if (!dir || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
      e.preventDefault();
      swipe.fling(dir);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [swipe]);

  if (!card) return null;
  const s = card.step;
  const labels =
    card.type === 'q'
      ? { right: `Yes: ${s.yes.label}`, left: `No: ${s.no.label}`, up: "Either's fine" }
      : card.type === 'fallback'
        ? { right: 'Yes, switch', left: 'No', up: "Either's fine" }
        : { right: `Yes: ${card.option.chip}`, left: 'No: next one', up: "Either's fine, keep it as a maybe" };

  return (
    <div className={`${styles.screen} ${styles.deckScreen}`}>
      {state.note && state.past.length <= 1 && <p className={styles.note}>{state.note}</p>}
      <div className={styles.stack} ref={swipe.stackRef}>
        {behind && (
          <div className={`${styles.card} ${styles.behind}`} aria-hidden="true">
            <div className={styles.art}>
              <img src={behind} alt="" draggable={false} />
            </div>
            <div className={styles.panel} />
          </div>
        )}
        <article
          key={cardKey}
          ref={swipe.cardRef}
          className={`${styles.card} ${styles.top} ${nudge ? styles.nudge : ''}`}
          onPointerDown={(e) => {
            setNudge(false);
            swipe.onPointerDown(e);
          }}
          onAnimationEnd={() => setNudge(false)}
          role="group"
          aria-roledescription="question card"
          aria-label={`${s.eyebrow.toLowerCase()}, step ${p.index} of ${p.total}: ${cardTitle(card)}`}
        >
          <div className={styles.art}>
            <img src={photo} alt="" draggable={false} />
            <span className={styles.tint} aria-hidden="true" />
            {DIRS.map((d) => (
              <span key={d} className={`${styles.stamp} ${styles[`stamp_${d}`]}`} aria-hidden="true">
                {STAMP[d]}
              </span>
            ))}
          </div>
          <div className={styles.panel}>
            <div className={styles.panelTop}>
              <span className={styles.eyebrow}>{s.eyebrow}</span>
              <span className={styles.count}>
                {p.index}/{p.total}
              </span>
            </div>
            <h2 className={styles.title}>{cardTitle(card)}</h2>
            <p className={styles.line}>{cardLine(card)}</p>
          </div>
        </article>
      </div>

      <div className={styles.answers}>
        <button type="button" className={`${styles.round} ${styles.no}`} onClick={() => swipe.fling('left')} aria-label={labels.left} data-dir="left">
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>
        <button type="button" className={styles.either} onClick={() => swipe.fling('up')} aria-label={labels.up} data-dir="up">
          Either&apos;s fine
        </button>
        <button type="button" className={`${styles.round} ${styles.yes}`} onClick={() => swipe.fling('right')} aria-label={labels.right} data-dir="right">
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <p className={styles.keys} aria-hidden="true">
        ← No · ↑ Either · → Yes
      </p>
    </div>
  );
}

/** The photo peeking behind the top card: the next option, or the next card in the flow. */
function behindPhoto(state, card) {
  if (!card) return null;
  if (card.type === 'option' && card.next) return state.answers.veg === 'yes' && card.next.photoVeg ? card.next.photoVeg : card.next.photo;
  const flow = flowOf(state);
  const i = flow.findIndex((st) => st.id === card.step.id);
  const next = flow.slice(i + 1).find((st) => !st.sub);
  if (!next) return null;
  return next.kind === 'q' ? next.photo : next.options[0].photo;
}

/**
 * Drag the card with a finger or mouse. The card follows directly (no React
 * renders while dragging); stamps, tint and the card behind read CSS
 * variables set on the stack. Past the threshold, or with a quick flick, the
 * card flies out and `onAnswer(dir)` runs.
 */
function useSwipe(onAnswer, cardKey) {
  const stackRef = useRef(null);
  const cardRef = useRef(null);
  const drag = useRef(null);
  const busy = useRef(false);
  const answerRef = useRef(onAnswer);
  answerRef.current = onAnswer;
  useEffect(() => {
    busy.current = false;
    setVars(0, 0, 0, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardKey]);

  const setVars = (pr, pl, pu, locked) => {
    const st = stackRef.current?.style;
    if (!st) return;
    st.setProperty('--pr', pr.toFixed(3));
    st.setProperty('--pl', pl.toFixed(3));
    st.setProperty('--pu', pu.toFixed(3));
    st.setProperty('--p', Math.max(pr, pl, pu).toFixed(3));
    stackRef.current.dataset.lock = locked || '';
  };

  const thresholds = () => {
    const r = cardRef.current?.getBoundingClientRect();
    return { x: (r?.width || 358) * 0.28, y: (r?.height || 520) * 0.22, w: r?.width || 358, h: r?.height || 520 };
  };

  const flyOut = (dir, from = { dx: 0, dy: 0, rot: 0 }) => {
    const el = cardRef.current;
    if (!el || busy.current) return;
    busy.current = true;
    const { w, h } = thresholds();
    const panelW = stackRef.current?.offsetWidth || w;
    buzz(dir === 'right' ? 12 : dir === 'left' ? 8 : [6, 30, 6]);
    setVars(dir === 'right' ? 1 : 0, dir === 'left' ? 1 : 0, dir === 'up' ? 1 : 0, dir);
    if (reducedMotion()) {
      el.style.transition = 'opacity 160ms linear';
      el.style.opacity = '0';
    } else {
      const x = dir === 'right' ? panelW + w : dir === 'left' ? -(panelW + w) : from.dx;
      const y = dir === 'up' ? -1.2 * h : from.dy;
      const rot = dir === 'up' ? 0 : dir === 'right' ? 24 : -24;
      el.style.transition = 'transform 280ms cubic-bezier(.25,.8,.4,1), opacity 280ms ease-in';
      el.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg)${dir === 'up' ? ' scale(.92)' : ''}`;
      el.style.opacity = '0';
    }
    setTimeout(() => answerRef.current(dir), reducedMotion() ? 160 : 260);
  };

  const fling = useCallback((dir) => {
    const el = cardRef.current;
    if (!el || busy.current) return;
    if (reducedMotion()) return flyOut(dir);
    // A short lean so the button press reads as a swipe.
    const lean = dir === 'right' ? 'translate(24px,0) rotate(4deg)' : dir === 'left' ? 'translate(-24px,0) rotate(-4deg)' : 'translate(0,-20px)';
    el.style.transition = 'transform 120ms ease-out';
    el.style.transform = lean;
    setVars(dir === 'right' ? 1 : 0, dir === 'left' ? 1 : 0, dir === 'up' ? 1 : 0, dir);
    setTimeout(() => {
      busy.current = false;
      flyOut(dir, { dx: dir === 'up' ? 0 : dir === 'right' ? 24 : -24, dy: dir === 'up' ? -20 : 0 });
    }, 120);
    busy.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointerDown = (e) => {
    if (busy.current || e.button > 0) return;
    const el = cardRef.current;
    el.setPointerCapture?.(e.pointerId);
    el.style.transition = 'none';
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, samples: [{ x: e.clientX, y: e.clientY, t: performance.now() }], axis: null, locked: null, raf: 0, dx: 0, dy: 0 };
    const move = (ev) => {
      const d = drag.current;
      if (!d || ev.pointerId !== d.id) return;
      let dx = ev.clientX - d.x;
      let dy = ev.clientY - d.y;
      if (!d.axis && Math.hypot(dx, dy) < 8) return;
      if (!d.axis) d.axis = Math.abs(dx) >= Math.abs(dy) * 0.8 ? 'x' : 'y';
      if (dy > 0) dy = Math.min(dy * 0.25, 24);
      d.dx = dx;
      d.dy = dy;
      d.samples.push({ x: ev.clientX, y: ev.clientY, t: performance.now() });
      if (d.samples.length > 8) d.samples.shift();
      cancelAnimationFrame(d.raf);
      d.raf = requestAnimationFrame(() => {
        const { x: tx, y: ty, w } = thresholds();
        const rot = reducedMotion() ? 0 : Math.max(-14, Math.min(14, (dx / w) * 16));
        el.style.transform = `translate(${dx}px, ${dy}px) rotate(${dy < 0 && Math.abs(dy) > Math.abs(dx) ? 0 : rot}deg)`;
        const up = dy < 0 && Math.abs(dy) > Math.abs(dx) * 1.2;
        const pr = !up && dx > 0 ? clamp01((dx - 16) / (tx - 16)) : 0;
        const pl = !up && dx < 0 ? clamp01((-dx - 16) / (tx - 16)) : 0;
        const pu = up ? clamp01((-dy - 16) / (ty - 16)) : 0;
        const locked = pr >= 1 ? 'right' : pl >= 1 ? 'left' : pu >= 1 ? 'up' : null;
        if (locked && locked !== d.locked) buzz(8);
        d.locked = locked;
        setVars(pr, pl, pu, locked);
      });
    };
    const up = (ev) => {
      const d = drag.current;
      if (!d || ev.pointerId !== d.id) return;
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      cancelAnimationFrame(d.raf);
      drag.current = null;
      const { x: tx, y: ty } = thresholds();
      const first = d.samples.find((s) => performance.now() - s.t < 80) || d.samples[0];
      const last = d.samples[d.samples.length - 1];
      const dt = Math.max(1, last.t - first.t);
      const vx = (last.x - first.x) / dt;
      const vy = (last.y - first.y) / dt;
      const { dx, dy } = d;
      let dir = null;
      if (dy < 0 && Math.abs(dy) > 1.2 * Math.abs(dx) && (-dy > ty || (vy < -0.5 && -dy > 24))) dir = 'up';
      else if (dx > tx || (vx > 0.5 && dx > 24)) dir = 'right';
      else if (dx < -tx || (vx < -0.5 && dx < -24)) dir = 'left';
      if (dir) return flyOut(dir, { dx, dy });
      el.style.transition = 'transform 380ms var(--ease-spring)';
      el.style.transform = '';
      setVars(0, 0, 0, null);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  return useMemo(() => ({ stackRef, cardRef, onPointerDown, fling }), [cardKey, fling]); // eslint-disable-line react-hooks/exhaustive-deps
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/* ---------- Not feeling any of these? ---------- */

function NothingFits({ state, card, onChoose, onKeep, onRestart }) {
  const [text, setText] = useState('');
  const step = card?.step;
  if (!step || step.kind !== 'pick') return null;
  const ps = state.picks[step.id] || { rejected: [], maybes: [] };
  const left = step.options.filter((o) => !ps.rejected.includes(o.id));
  const options = left.length ? left : step.options;
  const canKeep = card.type === 'option';
  return (
    <div className={`${styles.screen} ${styles.gridScreen}`}>
      <div className={styles.intro}>
        <h2 className={styles.h2}>Not feeling any of these?</h2>
        <p className={styles.sub}>Type what you want, or let us pick.</p>
      </div>
      <form
        className={styles.ask}
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) onChoose(step.id, { text: text.trim().slice(0, 40) });
        }}
      >
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 40))}
          placeholder="Biryani, momos, waffles…"
          aria-label="Type what you want"
          enterKeyHint="go"
        />
        <button type="submit" className={styles.askGo} disabled={!text.trim()} aria-label="Go">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </form>
      <div className={styles.options}>
        {options.map((o) => (
          <button key={o.id} type="button" className={`${styles.option} hw-press`} onClick={() => onChoose(step.id, o.id)}>
            <img src={state.answers.veg === 'yes' && o.photoVeg ? o.photoVeg : o.photo} alt="" />
            <span>{o.chip}</span>
          </button>
        ))}
        <button type="button" className={`${styles.surprise} ${styles.span2} hw-press`} onClick={() => onChoose(step.id, 'any')}>
          <DiceIcon />
          Surprise me
        </button>
      </div>
      <div className={styles.gridFoot}>
        {canKeep && (
          <button type="button" className={styles.textBtn} onClick={onKeep}>
            Keep swiping
          </button>
        )}
        <button type="button" className={styles.textBtn} onClick={onRestart}>
          Start over
        </button>
      </div>
    </div>
  );
}

/* ---------- Your pick ---------- */

function EndCard({ state, result, onGo, onRestart }) {
  const summary = chipsOf(state)
    .filter((c) => !c.any)
    .map((c) => c.label)
    .join(' · ');
  const photo = useMemo(() => {
    const flow = flowOf(state);
    for (const st of [...flow].reverse()) {
      if (st.kind !== 'pick') continue;
      const p = state.picks[st.id]?.pick;
      const id = p?.maybes ? p.maybes[0] : p;
      const o = st.options.find((x) => x.id === id);
      if (o) return state.answers.veg === 'yes' && o.photoVeg ? o.photoVeg : o.photo;
    }
    return TILE_BY_ID[state.tile].photo;
  }, [state]);

  useEffect(() => buzz([12, 40, 18]), []);

  return (
    <div className={`${styles.screen} ${styles.deckScreen}`}>
      <div className={styles.stack}>
        <article className={`${styles.card} ${styles.endCard}`}>
          <div className={styles.art}>
            <img src={photo} alt="" />
          </div>
          <div className={styles.panel}>
            <div className={styles.panelTop}>
              <span className={styles.eyebrow}>YOUR PICK</span>
            </div>
            <h2 className={`${styles.title} ${styles.endTitle}`}>{endTitle(result)}</h2>
            {summary && <p className={styles.line}>{summary}</p>}
          </div>
          <span className={styles.confetti} aria-hidden="true">
            {Array.from({ length: 12 }, (_, i) => (
              <i key={i} style={{ '--a': `${i * 30}deg`, '--d': `${80 + (i % 4) * 20}px` }} />
            ))}
          </span>
        </article>
      </div>
      <div className={styles.endActions}>
        <button type="button" className={`${styles.go} hw-press`} onClick={onGo}>
          Show me places
        </button>
        <button type="button" className={`${styles.round} ${styles.restart}`} onClick={onRestart} aria-label="Start over">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/* ---------- First-visit tips ---------- */

const TIPS = [
  { dir: 'right', title: 'Swipe right for yes', line: 'Like the sound of it? Send it right.' },
  { dir: 'left', title: 'Left for nope', line: "Not feeling it? Flick it left and we'll ask something else." },
  { dir: 'up', title: "Up if either's fine", line: "Don't mind? Swipe up. The ✕, Either's fine and ✓ buttons work too." },
];

function Tips({ onDone }) {
  const [i, setI] = useState(0);
  const tip = TIPS[i];
  const last = i === TIPS.length - 1;
  const next = () => (last ? onDone() : setI(i + 1));
  const ghost = useRef(null);
  const start = useRef(null);
  const nextRef = useRef(next);
  nextRef.current = next;
  const dialog = useRef(null);

  useEffect(() => {
    dialog.current?.querySelector('button[data-primary]')?.focus();
    const onKey = (e) => e.key === 'Escape' && onDone();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDone]);

  // Practise on the demo card: the right gesture moves to the next tip.
  const down = (e) => {
    start.current = { x: e.clientX, y: e.clientY };
    ghost.current.setPointerCapture?.(e.pointerId);
    ghost.current.classList.add(styles.ghostHeld);
  };
  const move = (e) => {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    const dy = Math.min(0, e.clientY - start.current.y);
    ghost.current.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 14}deg)`;
  };
  const up = (e) => {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    start.current = null;
    ghost.current.classList.remove(styles.ghostHeld);
    ghost.current.style.transform = '';
    const did = dy < -60 && Math.abs(dy) > Math.abs(dx) ? 'up' : dx > 70 ? 'right' : dx < -70 ? 'left' : null;
    if (did === tip.dir) {
      buzz(12);
      nextRef.current();
    }
  };

  return (
    <div className={styles.tips} role="dialog" aria-modal="true" aria-labelledby="hw-tip-title" ref={dialog}>
      <button type="button" className={styles.skip} onClick={onDone}>
        Skip
      </button>
      <div className={styles.stage}>
        <div className={styles.ghostBack} aria-hidden="true" />
        <div
          key={i}
          ref={ghost}
          className={`${styles.ghost} ${styles[`demo_${tip.dir}`]}`}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          aria-hidden="true"
        >
          <img src={TILES[0].steps[0].photo} alt="" draggable={false} />
          <span className={`${styles.stamp} ${styles[`stamp_${tip.dir}`]} ${styles.demoStamp}`}>{STAMP[tip.dir]}</span>
          <span className={styles.hand}>
            <HandIcon />
          </span>
        </div>
      </div>
      <div className={styles.tipPanel}>
        <div className={styles.dots} aria-hidden="true">
          {TIPS.map((t, n) => (
            <span key={t.dir} className={n === i ? styles.dotOn : ''} />
          ))}
        </div>
        <p className={styles.tipCount}>Tip {i + 1} of 3</p>
        <h2 id="hw-tip-title" key={`t${i}`} className={styles.tipTitle}>
          {tip.title}
        </h2>
        <p key={`l${i}`} className={styles.tipLine}>
          {tip.line}
        </p>
        <button type="button" data-primary className={`${styles.go} hw-press`} onClick={next}>
          {last ? "Let's go" : 'Next'}
        </button>
      </div>
    </div>
  );
}

/* ---------- Icons ---------- */

function DiceIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="8.5" cy="8.5" r="1.4" fill="currentColor" />
      <circle cx="15.5" cy="15.5" r="1.4" fill="currentColor" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
    </svg>
  );
}

function HandIcon() {
  return (
    <svg viewBox="0 0 24 24" width="40" height="40" aria-hidden="true">
      <path
        d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10m0-.5V4a1.5 1.5 0 0 1 3 0v6m0-1.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.6a6 6 0 0 1-4.6-2.2L3.6 15a1.6 1.6 0 0 1 2.3-2.2L8 14.5"
        fill="#fff"
        stroke="#17171A"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
