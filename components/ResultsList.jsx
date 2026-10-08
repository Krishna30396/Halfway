'use client';

import PlaceCard from './PlaceCard';
import styles from './ResultsList.module.css';

export default function ResultsList({
  places,
  hub,
  loading,
  error,
  activePlaceId,
  onHover,
  onSelect,
  onWidenRadius,
  canWiden,
  emptyText = 'Nothing here in this radius.',
  widenText = 'Try a bigger radius',
}) {
  if (loading) {
    return (
      <div className={styles.loading} aria-live="polite">
        <span className={styles.srOnly}>Finding places…</span>
        {[0, 1, 2].map((i) => (
          <div key={i} className={styles.skeleton} style={{ animationDelay: `${i * 120}ms` }} aria-hidden="true">
            <span className={styles.skThumb} />
            <span className={styles.skLines}>
              <span />
              <span />
            </span>
          </div>
        ))}
      </div>
    );
  }
  if (error) {
    return <div className={styles.stateError}>{error}</div>;
  }
  if (!places) return null;
  if (!places.length) {
    // Empty is not an error: nothing here — offer the fix as a button.
    return (
      <div className={styles.state}>
        {emptyText}
        {canWiden && (
          <button type="button" className={`${styles.widen} hw-press`} onClick={onWidenRadius}>
            {widenText}
          </button>
        )}
      </div>
    );
  }

  return (
    <ul className={styles.list} aria-label={`${places.length} places found`}>
      {places.map((p, i) => (
        <PlaceCard
          key={p.id}
          place={p}
          hub={hub}
          index={i}
          active={p.id === activePlaceId}
          onHover={onHover}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}
