'use client';

import { maneuverArrow, fmtKm, fmtMin } from '@/lib/navigation';
import s from './Social.module.css';

/** Turn-by-turn banner for whoever is being followed ("You" or a friend's name). */
export default function NavBanner({ who, isMe, pos, live, arrived }) {
  const { progress, error, atDestination } = live;
  const step = progress?.next;
  const done = arrived || atDestination;

  let main;
  if (done) main = <strong>{isMe ? 'You have arrived' : `${who} has arrived`}</strong>;
  else if (!pos) main = <strong>{isMe ? 'Waiting for your GPS…' : `Waiting for ${who}'s location…`}</strong>;
  else if (step)
    main = (
      <>
        <span className={s.navDist}>{fmtKm(progress.nextKm)}</span>
        <strong>{step.instruction}</strong>
      </>
    );
  else if (error) main = <strong>Couldn&apos;t load the route — retrying…</strong>;
  else main = <strong>Finding the route…</strong>;

  return (
    <div className={s.navBanner} role="status" aria-live="polite">
      <div className={s.navArrow} aria-hidden="true">
        {done ? '⚑' : maneuverArrow(step)}
      </div>
      <div className={s.navText}>
        {main}
        {progress && !done && (
          <span className={s.navMeta}>
            {isMe ? '' : `${who} · `}
            {fmtKm(progress.remainingKm)} left
            {progress.etaMin != null && ` · ~${fmtMin(progress.etaMin)}`}
          </span>
        )}
      </div>
    </div>
  );
}
