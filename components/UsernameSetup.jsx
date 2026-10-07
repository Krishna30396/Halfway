'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from './AuthProvider';
import { getSupabase } from '@/lib/supabase';
import { USERNAME_RE } from '@/lib/social';
import s from './Social.module.css';

/**
 * The whole "account" flow: pick a username and you're in. Without a session
 * this creates a guest (anonymous) account tied to this device.
 */
export default function UsernameSetup({ onDone, compact = false }) {
  const { user } = useAuth();
  const [uname, setUname] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    const username = uname.trim().replace(/^@/, '').toLowerCase();
    if (!USERNAME_RE.test(username)) {
      setError('3–20 characters: lowercase letters, numbers and _.');
      return;
    }
    const supabase = getSupabase();
    setBusy(true);
    setError(null);
    try {
      let userId = user?.id;
      if (!userId) {
        const { data, error: authError } = await supabase.auth.signInAnonymously();
        if (authError) {
          throw new Error(
            /anonymous/i.test(authError.message)
              ? 'Quick start is switched off on the server right now. Ask the app owner to enable anonymous sign-ins.'
              : authError.message
          );
        }
        userId = data.user.id;
      }
      const { error: saveError } = await supabase.from('profiles').upsert({
        id: userId,
        username,
        display_name: name.trim() || null,
        updated_at: new Date().toISOString(),
      });
      if (saveError) {
        throw new Error(saveError.code === '23505' ? 'That username is taken — try another.' : saveError.message);
      }
      onDone?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      {!compact && (
        <p className={s.muted} style={{ marginBottom: 12 }}>
          Pick a username so friends can find you. No email or password needed.
        </p>
      )}
      <div className={s.field}>
        <label className={s.label} htmlFor="setup-uname">Username</label>
        <input
          id="setup-uname"
          className={s.input}
          value={uname}
          onChange={(e) => setUname(e.target.value.toLowerCase())}
          placeholder="e.g. krishna"
          autoCapitalize="none"
          autoComplete="username"
          maxLength={21}
          required
        />
      </div>
      <div className={s.field}>
        <label className={s.label} htmlFor="setup-name">Your name (optional)</label>
        <input
          id="setup-name"
          className={s.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Krishna"
          maxLength={40}
        />
      </div>
      {error && <p className={s.error} style={{ marginTop: 12 }}>{error}</p>}
      <div className={s.actions}>
        <button type="submit" className={s.primary} disabled={busy}>
          {busy ? 'Setting up…' : 'Continue'}
        </button>
      </div>
      {!user && (
        <p className={s.hint} style={{ textAlign: 'center' }}>
          Already have an account? <Link href="/auth/login">Sign in</Link>
        </p>
      )}
    </form>
  );
}
