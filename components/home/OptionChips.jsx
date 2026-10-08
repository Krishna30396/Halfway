'use client';

import styles from './OptionChips.module.css';

/** Single-choice pill chips (1 km / 3 km / 5 km, 5 / 10 / 15 min). */
export default function OptionChips({ options, value, onChange, format, label }) {
  return (
    <div className={styles.row} role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const on = o === value;
        return (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={on}
            className={`${on ? styles.chipOn : styles.chip} hw-press`}
            onClick={() => onChange(o)}
          >
            {format(o)}
          </button>
        );
      })}
    </div>
  );
}
