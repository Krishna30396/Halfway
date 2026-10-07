'use client';

import { useEffect, useState } from 'react';
import { useAuth } from './AuthProvider';
import { getSupabase } from '@/lib/supabase';
import s from './Social.module.css';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function masked(email) {
  const [name, domain] = email.split('@');
  return `${name.slice(0, 2)}${'•'.repeat(Math.max(1, name.length - 2))}@${domain}`;
}

/**
 * Optional email for friend requests and meetup alerts — the fallback for
 * iPhones in Safari and anyone whose notifications don't come through.
 * Only this person can read the address; friends never see it.
 */
export default function EmailAlerts() {
  const { user } = useAuth();
  const supabase = getSupabase();
  const [row, setRow] = useState(undefined);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const userId = user?.id;

  useEffect(() => {
    if (!supabase || !userId) return;
    supabase
      .from('email_alerts')
      .select('email, enabled')
      .eq('user_id', userId)
      .maybeSingle()
      // false: the table isn't set up yet (schema not run) — hide the card.
      .then(({ data, error: err }) => setRow(err ? false : data));
  }, [supabase, userId]);

  if (!user || row === undefined || row === false) return null;

  const save = async (e) => {
    e.preventDefault();
    const email = value.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      setError('That doesn’t look like an email address.');
      return;
    }
    setBusy(true);
    setError(null);
    const next = { user_id: user.id, email, enabled: true, updated_at: new Date().toISOString() };
    const { error: err } = await supabase.from('email_alerts').upsert(next);
    setBusy(false);
    if (err) {
      setError("Couldn't save that. Try again in a moment.");
      return;
    }
    setRow(next);
    setEditing(false);
  };

  const setEnabled = async (enabled) => {
    setBusy(true);
    const { error: err } = await supabase.from('email_alerts').update({ enabled }).eq('user_id', user.id);
    setBusy(false);
    if (!err) setRow({ ...row, enabled });
  };

  const on = row?.enabled && !editing;

  return (
    <section className={s.card}>
      <div className={s.notify}>
        <div className={s.notifyText}>
          <strong>Email alerts</strong>
          {on
            ? `Friend requests and meetup invites also go to ${masked(row.email)}.`
            : row && !row.enabled && !editing
              ? `Off — nothing is emailed to ${masked(row.email)}.`
              : 'Get an email when a friend adds you, wants to meet or suggests a place. Handy on iPhone, or if notifications don’t arrive. Friends never see your address.'}
        </div>
      </div>

      {editing || !row ? (
        <form onSubmit={save} className={s.emailForm}>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            className={s.input}
            placeholder="you@example.com"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="Email for alerts"
            required
          />
          <div className={s.actions}>
            <button type="submit" className={`${s.primary} ${s.small}`} disabled={busy}>
              {busy ? '…' : 'Email me alerts'}
            </button>
            {editing && (
              <button type="button" className={`${s.secondary} ${s.small}`} onClick={() => setEditing(false)}>
                Cancel
              </button>
            )}
          </div>
        </form>
      ) : (
        <div className={s.actions}>
          <button
            type="button"
            className={`${s.secondary} ${s.small}`}
            onClick={() => {
              setValue(row.email);
              setEditing(true);
            }}
          >
            Change email
          </button>
          <button type="button" className={`${s.secondary} ${s.small}`} onClick={() => setEnabled(!row.enabled)} disabled={busy}>
            {row.enabled ? 'Turn off' : 'Turn on'}
          </button>
        </div>
      )}
      {error && <p className={s.error} style={{ marginTop: 10 }}>{error}</p>}
    </section>
  );
}
