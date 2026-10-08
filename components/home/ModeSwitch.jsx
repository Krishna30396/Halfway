'use client';

import { useRef } from 'react';
import styles from './ModeSwitch.module.css';

export const MODES = [
  { id: 'nearby', label: 'Nearby' },
  { id: 'halfway', label: 'Halfway' },
  { id: 'onway', label: 'On the way' },
];

/** Three-way segmented control with a sliding thumb. Arrow keys move between modes. */
export default function ModeSwitch({ value, onChange }) {
  const index = Math.max(0, MODES.findIndex((m) => m.id === value));
  const refs = useRef([]);

  const onKeyDown = (e) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + MODES.length) % MODES.length;
    onChange(MODES[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div className={styles.track} role="radiogroup" aria-label="Where should we look?" onKeyDown={onKeyDown}>
      <span
        className={styles.thumb}
        style={{ transform: `translateX(${index * 100}%)` }}
        aria-hidden="true"
      />
      {MODES.map((m, i) => (
        <button
          key={m.id}
          ref={(el) => (refs.current[i] = el)}
          type="button"
          role="radio"
          aria-checked={i === index}
          tabIndex={i === index ? 0 : -1}
          className={i === index ? styles.optOn : styles.opt}
          onClick={() => onChange(m.id)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
