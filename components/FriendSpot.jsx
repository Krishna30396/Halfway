'use client';

import { haversine } from '@/lib/geo';
import { fmtKm } from '@/lib/navigation';
import s from './Social.module.css';

function ago(iso, now) {
  if (!iso) return null;
  const sec = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (sec < 15) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  return `${Math.round(sec / 60)} min ago`;
}

/** Top card while looking at a friend's spot: how far apart you are, how fresh it is. */
export default function FriendSpot({ name, me, friend, now }) {
  const apart = me && friend ? haversine([me.lat, me.lng], [friend.lat, friend.lng]) : null;
  const updated = ago(friend?.updated_at, now);
  return (
    <div className={s.navBanner} role="status" aria-live="polite">
      <div className={`${s.navArrow} ${s.navArrowFriend}`} aria-hidden="true">
        📍
      </div>
      <div className={s.navText}>
        <strong>{friend ? `${name}'s location` : `Waiting for ${name}'s location…`}</strong>
        {friend && (
          <span className={s.navMeta}>
            {apart != null && `${fmtKm(apart)} from you`}
            {updated && ` · updated ${updated}`}
          </span>
        )}
      </div>
    </div>
  );
}
