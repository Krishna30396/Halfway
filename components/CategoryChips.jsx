'use client';

import { useState } from 'react';
import { CATEGORIES } from '@/lib/categories';
import styles from './CategoryChips.module.css';

/**
 * Category chips. Pass `primary` (a list of ids) to show only those up front
 * with a "More" chip that expands the rest; without it every chip shows.
 */
export default function CategoryChips({ selected, onToggle, primary }) {
  const [expanded, setExpanded] = useState(false);
  const collapsible = Array.isArray(primary) && primary.length < CATEGORIES.length;
  const open = !collapsible || expanded;

  const ordered = collapsible
    ? [
        ...primary.map((id) => CATEGORIES.find((c) => c.id === id)).filter(Boolean),
        ...CATEGORIES.filter((c) => !primary.includes(c.id)),
      ]
    : CATEGORIES;

  // Collapsed, a selected category from under "More" still shows up front.
  const visible = open
    ? ordered
    : ordered.filter((c) => primary.includes(c.id) || selected.includes(c.id));

  return (
    <div
      className={collapsible ? styles.wrapRow : styles.row}
      role="group"
      aria-label="Place categories"
    >
      {visible.map((c, i) => {
        const on = selected.includes(c.id);
        const extra = collapsible && !primary.includes(c.id);
        return (
          <button
            key={c.id}
            type="button"
            className={`${on ? styles.chipOn : styles.chip} ${extra ? styles.extra : ''} hw-press`}
            style={extra ? { animationDelay: `${Math.max(0, i - primary.length) * 30}ms` } : undefined}
            aria-pressed={on}
            onClick={() => onToggle(c.id)}
          >
            {c.short || c.label}
          </button>
        );
      })}
      {collapsible && (
        <button
          type="button"
          className={`${styles.more} hw-press`}
          aria-expanded={open}
          onClick={() => setExpanded((e) => !e)}
        >
          {open ? 'Less' : 'More'}
          <svg
            className={open ? styles.caretUp : styles.caret}
            width="12"
            height="12"
            viewBox="0 0 12 12"
            aria-hidden="true"
          >
            <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </div>
  );
}
