'use client';

import { useMemo } from 'react';
import { CATEGORIES } from '@/lib/categories';
import styles from './AreaGuide.module.css';

export default function AreaGuide({ places, onCategoryFilter, activeCats }) {
  const stats = useMemo(() => {
    if (!places?.length) return [];
    const counts = {};
    for (const p of places) {
      if (p.category) counts[p.category] = (counts[p.category] || 0) + 1;
    }
    return CATEGORIES
      .filter((c) => counts[c.id])
      .map((c) => ({ ...c, count: counts[c.id] }))
      .sort((a, b) => b.count - a.count);
  }, [places]);

  const suggestions = useMemo(() => {
    if (!places?.length) return [];
    const byCat = {};
    for (const p of places) {
      if (!p.category) continue;
      if (!byCat[p.category]) byCat[p.category] = [];
      if (byCat[p.category].length < 3) byCat[p.category].push(p);
    }

    const tips = [];
    const catLabels = {
      cafe: 'coffee',
      restaurant: 'dining',
      bar: 'drinks',
      park: 'outdoors',
      sport: 'activity',
      culture: 'culture',
      games: 'fun',
      fastfood: 'a quick bite',
      shopping: 'shopping',
    };

    for (const c of CATEGORIES) {
      const items = byCat[c.id];
      if (!items?.length) continue;
      tips.push({
        id: c.id,
        label: `Best for ${catLabels[c.id] || c.label.toLowerCase()}`,
        topPlace: items[0].name,
        count: items.length,
        color: c.color,
      });
    }
    return tips.slice(0, 4);
  }, [places]);

  if (!stats.length) return null;

  return (
    <div className={styles.guide}>
      <div className={styles.stats}>
        {stats.map((s) => (
          <button
            key={s.id}
            type="button"
            className={activeCats.includes(s.id) ? styles.statOn : styles.stat}
            onClick={() => onCategoryFilter(s.id)}
          >
            <span className={styles.statDot} style={{ background: s.color }} />
            <span className={styles.statCount}>{s.count}</span>
            <span className={styles.statLabel}>{s.label}</span>
          </button>
        ))}
      </div>

      {suggestions.length > 0 && (
        <div className={styles.suggestions}>
          {suggestions.map((tip) => (
            <button
              key={tip.id}
              type="button"
              className={styles.tip}
              onClick={() => onCategoryFilter(tip.id)}
            >
              <span className={styles.tipDot} style={{ background: tip.color }} />
              <span className={styles.tipLabel}>{tip.label}</span>
              <span className={styles.tipPlace}>{tip.topPlace}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
