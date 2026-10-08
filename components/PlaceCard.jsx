'use client';

import { CATEGORIES } from '@/lib/categories';
import { haversine } from '@/lib/geo';
import PlaceImage from './PlaceImage';
import styles from './PlaceCard.module.css';

const labelFor = (id) => CATEGORIES.find((c) => c.id === id)?.label || '';
const colorFor = (id) => CATEGORIES.find((c) => c.id === id)?.color || 'var(--muted)';

export default function PlaceCard({ place, hub, active, onHover, onSelect, index = 0 }) {
  const distKm =
    place.distanceKm ?? (hub ? haversine([hub.lat, hub.lng], [place.lat, place.lng]) : null);

  // "On the way" results carry the extra minutes the stop adds to the trip.
  const badge =
    place.detourMin != null
      ? `+${Math.max(1, Math.round(place.detourMin))} min`
      : distKm != null
        ? `${distKm.toFixed(1)} km`
        : null;

  return (
    <li
      className={`${active ? styles.cardActive : styles.card} hw-rise`}
      style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
      onMouseEnter={() => onHover(place.id)}
      onMouseLeave={() => onHover(null)}
    >
      <button type="button" className={`${styles.button} hw-press`} onClick={() => onSelect(place.id)}>
        <PlaceImage place={place} size={56} />
        <div className={styles.info}>
          <div className={styles.top}>
            <span className={styles.name}>{place.name}</span>
            {badge && <span className={place.detourMin != null ? styles.detour : styles.dist}>{badge}</span>}
          </div>
          <div className={styles.meta}>
            <span
              className={styles.dot}
              style={{ background: colorFor(place.category) }}
              aria-hidden="true"
            />
            <span className={styles.metaText}>
              {labelFor(place.category)}
              {place.cuisine ? ` · ${place.cuisine.split(';')[0].replace(/_/g, ' ')}` : ''}
              {place.street ? ` · ${place.street}` : ''}
            </span>
          </div>
          {place.openingHours && <div className={styles.hours}>{place.openingHours}</div>}
        </div>
      </button>
    </li>
  );
}
