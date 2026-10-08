'use client';

import { CATEGORIES } from '@/lib/categories';
import styles from './CategoryChips.module.css';

/**
 * Category chips. With `primary` (a list of ids) only those show, followed by
 * a "More" chip that calls `onMore` (the page opens a free-text search bar).
 * Without `primary` every category shows (used on the meetup screen).
 */
export default function CategoryChips({ selected, onToggle, primary, onMore, moreOpen = false }) {
  const compact = Array.isArray(primary);
  const visible = compact
    ? primary.map((id) => CATEGORIES.find((c) => c.id === id)).filter(Boolean)
    : CATEGORIES;

  return (
    <div className={compact ? styles.centreRow : styles.row} role="group" aria-label="Place categories">
      {visible.map((c) => {
        const on = selected.includes(c.id);
        return (
          <button
            key={c.id}
            type="button"
            className={`${on ? styles.chipOn : styles.chip} hw-press`}
            aria-pressed={on}
            onClick={() => onToggle(c.id)}
          >
            {c.short || c.label}
          </button>
        );
      })}
      {compact && onMore && (
        <button
          type="button"
          className={`${moreOpen ? styles.chipOn : styles.chip} hw-press`}
          aria-expanded={moreOpen}
          onClick={onMore}
        >
          More
        </button>
      )}
    </div>
  );
}
