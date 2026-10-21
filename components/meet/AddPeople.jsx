'use client';

import { useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { fetchProfiles, displayName, initialOf } from '@/lib/social';
import m from './Meet.module.css';

export const MAX_PEOPLE = 6;

/**
 * Group meetups: who's been invited but hasn't joined yet, and "Add people"
 * to bring more of your friends into a meetup that's already going.
 */
export default function AddPeople({ userId, takenIds, invited, onAdd }) {
  const [open, setOpen] = useState(false);
  const [friends, setFriends] = useState(null);
  const [adding, setAdding] = useState(null);
  const [error, setError] = useState(null);
  const full = takenIds.length >= MAX_PEOPLE;

  const openList = async () => {
    setOpen(true);
    setError(null);
    const supabase = getSupabase();
    const { data, error: err } = await supabase.from('friendships').select('requester, addressee').eq('status', 'accepted');
    if (err) {
      setError("Couldn't load your friends. Try again.");
      setFriends([]);
      return;
    }
    const ids = (data || []).map((f) => (f.requester === userId ? f.addressee : f.requester));
    const people = await fetchProfiles(ids);
    setFriends(ids.map((id) => ({ id, profile: people[id] })));
  };

  const add = async (id) => {
    setAdding(id);
    setError(null);
    try {
      await onAdd(id);
    } catch (err) {
      setError(err.message || "Couldn't add them. Try again.");
    } finally {
      setAdding(null);
    }
  };

  const choices = (friends || []).filter((f) => !takenIds.includes(f.id));

  return (
    <section className={m.addPeople}>
      {invited.length > 0 && (
        <ul className={m.people}>
          {invited.map((p) => (
            <li key={p.id} className={m.person}>
              <span className={m.avatarFriend} aria-hidden="true">
                {initialOf(p.profile)}
              </span>
              <span className={m.personMain}>
                <span className={m.personName} style={{ display: 'block' }}>
                  {displayName(p.profile)}
                </span>
                <span className={m.personSub} style={{ display: 'block' }}>
                  Invited · waiting for them to join
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {!open ? (
        <button type="button" className={m.btnGhost} onClick={openList} disabled={full}>
          {full ? `That's everyone · ${MAX_PEOPLE} max` : '+ Add people'}
        </button>
      ) : (
        <div className={m.addList}>
          <div className={m.addHead}>
            <span className={m.kicker}>Add friends to this meetup</span>
            <button type="button" className={`${m.btnGhost} ${m.btnSm}`} onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
          {friends == null ? (
            <p className={m.hint}>Loading your friends…</p>
          ) : choices.length === 0 ? (
            <p className={m.hint}>All your friends are already in this one.</p>
          ) : (
            <ul className={m.people}>
              {choices.map((f) => (
                <li key={f.id} className={m.person}>
                  <span className={m.avatarFriend} aria-hidden="true">
                    {initialOf(f.profile)}
                  </span>
                  <span className={m.personMain}>
                    <span className={m.personName}>{displayName(f.profile)}</span>
                  </span>
                  <button
                    type="button"
                    className={`${m.btn} ${m.btnSm}`}
                    onClick={() => add(f.id)}
                    disabled={!!adding || full}
                  >
                    {adding === f.id ? 'Adding…' : 'Add'}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className={m.hint}>
            They get a notification and join once they accept. Up to {MAX_PEOPLE} people per meetup.
          </p>
        </div>
      )}
      {error && (
        <p className={m.hint} role="alert" style={{ color: 'var(--color-error, #C2410C)' }}>
          {error}
        </p>
      )}
    </section>
  );
}
