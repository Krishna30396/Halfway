'use client';

import styles from './ExplorePrompt.module.css';

const QUICK_PICKS = [
  { emoji: '☕', label: 'Coffee date', cats: ['cafe'] },
  { emoji: '🍽️', label: 'Dinner out', cats: ['restaurant'] },
  { emoji: '🍻', label: 'Drinks', cats: ['bar'] },
  { emoji: '🌳', label: 'Outdoors', cats: ['park', 'sport'] },
  { emoji: '🎭', label: 'Culture', cats: ['culture'] },
  { emoji: '🎲', label: 'Games night', cats: ['games'] },
];

export default function ExplorePrompt({ onPickCategories }) {
  return (
    <div className={styles.wrap}>
      <p className={styles.headline}>What are you meeting for?</p>
      <div className={styles.picks}>
        {QUICK_PICKS.map((p) => (
          <button
            key={p.label}
            type="button"
            className={styles.pick}
            onClick={() => onPickCategories(p.cats)}
          >
            <span className={styles.pickEmoji}>{p.emoji}</span>
            <span className={styles.pickLabel}>{p.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
