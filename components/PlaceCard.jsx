'use client';

import { CATEGORIES } from '@/lib/categories';
import { haversine } from '@/lib/geo';
import PlaceImage from './PlaceImage';
import styles from './PlaceCard.module.css';

const labelFor = (id) => CATEGORIES.find((c) => c.id === id)?.label || '';
const colorFor = (id) => CATEGORIES.find((c) => c.id === id)?.color || 'var(--muted)';

export default function PlaceCard({ place, hub, active, onHover, onSelect }) {
  const distKm =
    place.distanceKm ?? (hub ? haversine([hub.lat, hub.lng], [place.lat, place.lng]) : null);

  return (
    <li
      className={active ? styles.cardActive : styles.card}
      onMouseEnter={() => onHover(place.id)}
      onMouseLeave={() => onHover(null)}
    >
      <button type="button" className={styles.button} onClick={() => onSelect(place.id)}>
        <PlaceImage place={place} size={56} />
        <div className={styles.info}>
          <div className={styles.top}>
            <span
              className={styles.dot}
              style={{ background: colorFor(place.category) }}
              aria-hidden="true"
            />
            <span className={styles.name}>{place.name}</span>
            {distKm != null && (
              <span className={styles.dist}>{distKm.toFixed(1)}&thinsp;km</span>
            )}
          </div>
          <div className={styles.meta}>
            {labelFor(place.category)}
            {place.cuisine ? ` · ${place.cuisine.split(';')[0].replace(/_/g, ' ')}` : ''}
            {place.street ? ` · ${place.street}` : ''}
          </div>
          {place.openingHours && (
            <div className={styles.hours}>{place.openingHours}</div>
          )}
        </div>
      </button>
    </li>
  );
}
