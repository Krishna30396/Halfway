'use client';

import styles from './FriendChips.module.css';

/**
 * Friend chips (avatar letter + name) and a dashed "+ Invite" chip.
 * Tapping the selected friend again deselects them.
 */
export default function FriendChips({ friends, selectedId, onSelect, onInvite, inviteHref }) {
  const invite = (
    <>
      <span className={styles.plus} aria-hidden="true">+</span>
      Invite
    </>
  );

  return (
    <div className={styles.row} role="group" aria-label="Your friends">
      {friends.map((fr) => {
        const on = fr.id === selectedId;
        return (
          <button
            key={fr.id}
            type="button"
            aria-pressed={on}
            className={`${on ? styles.chipOn : styles.chip} hw-press`}
            onClick={() => onSelect(on ? null : fr.id)}
          >
            <span className={styles.avatar} aria-hidden="true">{fr.initial}</span>
            <span className={styles.name}>{fr.name}</span>
          </button>
        );
      })}
      {onInvite ? (
        <button type="button" className={`${styles.invite} hw-press`} onClick={onInvite}>
          {invite}
        </button>
      ) : (
        <a href={inviteHref || '/friends'} className={`${styles.invite} hw-press`}>
          {invite}
        </a>
      )}
    </div>
  );
}
