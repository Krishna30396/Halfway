'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import NotificationToggle from './NotificationToggle';
import EmailAlerts from './EmailAlerts';
import UsernameSetup from './UsernameSetup';
import ThemeToggle from './ThemeToggle';
import Avatar, { AVATARS } from './Avatar';
import { ArrowLeft } from './meet/icons';
import { CATEGORIES } from '@/lib/categories';
import { USERNAME_RE } from '@/lib/social';
import s from './Social.module.css';
import p from './ProfileScreen.module.css';

const DISTANCES = [1, 3, 5];

/** Where the browser's location permission stands: 'granted' | 'prompt' | 'denied' | null. */
function useLocationPermission() {
  const [state, setState] = useState(null);
  useEffect(() => {
    let status;
    navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((st) => {
        status = st;
        setState(st.state);
        st.onchange = () => setState(st.state);
      })
      .catch(() => {});
    return () => {
      if (status) status.onchange = null;
    };
  }, []);
  return [state, setState];
}

/**
 * Profile: avatar, name, notifications, the defaults Search and Explore start
 * with, location permission, and account actions. `f` is useFriends() (or
 * sample data in /dev/profile-preview).
 */
export default function ProfileScreen({ f, supabase, onSignOut }) {
  const { user, authLoading, loaded, me } = f;
  const [mine, setMine] = useState({}); // optimistic edits until the reload lands
  const [editing, setEditing] = useState(false);
  const [unameDraft, setUnameDraft] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(null);
  const [location, setLocation] = useLocationPermission();

  if (!supabase) {
    return (
      <Shell>
        <p className={`${s.card} ${s.muted}`}>Accounts aren&apos;t set up on this copy of Halfway.</p>
      </Shell>
    );
  }
  if (authLoading || (user && !loaded)) {
    return (
      <Shell>
        <span className={s.spinner} aria-hidden="true" />
      </Shell>
    );
  }
  // Signed out (or no username yet): the whole page still shows, with the
  // username / sign-in card on top; settings that need an account say so.
  const signedIn = !!user && !!me?.username;
  const profile = { ...(me || {}), ...mine };
  const radius = DISTANCES.includes(profile.default_radius) ? profile.default_radius : 3;
  const favs = profile.preferred_categories || [];

  // Saves one or more profile fields; the screen updates straight away.
  const save = async (fields, key) => {
    if (!signedIn) {
      setMsg({ err: true, text: 'Make your profile above first — then this saves.' });
      return false;
    }
    setMine((m) => ({ ...m, ...fields }));
    setBusy(key);
    setMsg(null);
    const { error } = await supabase
      .from('profiles')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', user.id);
    setBusy(null);
    if (error) {
      setMine((m) => {
        const next = { ...m };
        for (const k of Object.keys(fields)) delete next[k];
        return next;
      });
      setMsg({ err: true, text: "Couldn't save that. Try again." });
      return false;
    }
    f.reload();
    return true;
  };

  const saveName = async (e) => {
    e.preventDefault();
    const uname = unameDraft.trim().replace(/^@/, '').toLowerCase();
    if (!USERNAME_RE.test(uname)) {
      setMsg({ err: true, text: 'Usernames are 3–20 characters: lowercase letters, numbers and _.' });
      return;
    }
    setBusy('name');
    const { error } = await supabase
      .from('profiles')
      .update({ username: uname, updated_at: new Date().toISOString() })
      .eq('id', user.id);
    setBusy(null);
    if (error) {
      setMsg({ err: true, text: error.code === '23505' ? 'That username is taken — try another.' : error.message });
      return;
    }
    setMine((m) => ({ ...m, username: uname }));
    setEditing(false);
    setMsg(null);
    f.reload();
  };

  const toggleFav = (id) => {
    const next = favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id];
    if (next.length) save({ preferred_categories: next }, 'cats');
  };

  const askLocation = () =>
    navigator.geolocation?.getCurrentPosition(
      () => setLocation('granted'),
      (err) => setLocation(err.code === 1 ? 'denied' : location),
      { timeout: 10000 }
    );

  const invite = async () => {
    setBusy('invite');
    const text = await f.shareInvite();
    setBusy(null);
    if (text) setMsg({ text });
  };

  return (
    <Shell>
      {/* ---- You ---- */}
      <section className={`${s.card} ${p.hero}`}>
        <Avatar person={profile} size={88} className={p.heroAvatar} />
        {!signedIn ? (
          <div className={p.nameForm}>
            <h2 className={p.name} style={{ textAlign: 'center', marginBottom: 10 }}>Make your profile</h2>
            <UsernameSetup onDone={f.reload} />
          </div>
        ) : editing ? (
          <form className={p.nameForm} onSubmit={saveName}>
            <div className={s.field}>
              <label className={s.label} htmlFor="uname">Username</label>
              <input
                id="uname"
                className={s.input}
                value={unameDraft}
                onChange={(e) => setUnameDraft(e.target.value.toLowerCase())}
                autoCapitalize="none"
                autoComplete="username"
                maxLength={21}
                required
              />
            </div>
            <div className={s.actions}>
              <button type="submit" className={s.primary} disabled={busy === 'name'}>
                {busy === 'name' ? 'Saving…' : 'Save'}
              </button>
              <button type="button" className={s.secondary} onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <h2 className={p.name}>{profile.display_name || `@${profile.username}`}</h2>
            <p className={p.handle}>@{profile.username}</p>
            <button
              type="button"
              className={s.openPill}
              onClick={() => {
                setUnameDraft(profile.username || '');
                setMsg(null);
                setEditing(true);
              }}
            >
              Edit username
            </button>
          </>
        )}
      </section>

      {msg && <p className={msg.err ? s.error : s.ok}>{msg.text}</p>}

      {/* ---- Avatar ---- */}
      <section>
        <h2 className={s.sectionLabel}>Your avatar</h2>
        <div className={`${s.card} ${p.avatarGrid}`} role="radiogroup" aria-label="Avatar">
          {[{ id: null }, ...AVATARS].map((a) => {
            const on = (profile.avatar || null) === a.id;
            return (
              <button
                key={a.id || 'letter'}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={a.id ? `Face ${a.id.slice(1)}` : 'Your initial'}
                className={on ? p.pickOn : p.pick}
                onClick={() => !on && save({ avatar: a.id }, 'avatar')}
              >
                <Avatar person={{ ...profile, avatar: a.id }} size={52} className={a.id ? undefined : p.letter} />
              </button>
            );
          })}
        </div>
        <p className={p.note}>Friends see this on meetups and in their friends list.</p>
      </section>

      {/* ---- Notifications ---- */}
      <section>
        <h2 className={s.sectionLabel}>Notifications</h2>
        {signedIn ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <NotificationToggle showTest />
            <EmailAlerts />
          </div>
        ) : (
          <p className={`${s.card} ${s.muted}`}>Make your profile to get meetup notifications and email alerts.</p>
        )}
      </section>

      {/* ---- Defaults ---- */}
      <section>
        <h2 className={s.sectionLabel}>Search and Explore start with</h2>
        <div className={s.card}>
          <p className={p.rowLabel}>Distance around you</p>
          <div className={p.chips}>
            {DISTANCES.map((km) => (
              <button
                key={km}
                type="button"
                className={km === radius ? p.chipOn : p.chip}
                aria-pressed={km === radius}
                onClick={() => km !== radius && save({ default_radius: km }, 'radius')}
              >
                {km} km
              </button>
            ))}
          </div>
          <p className={p.rowLabel}>Favourite kinds of places</p>
          <div className={p.chips}>
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                className={favs.includes(c.id) ? p.chipOn : p.chip}
                aria-pressed={favs.includes(c.id)}
                onClick={() => toggleFav(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Location ---- */}
      <section>
        <h2 className={s.sectionLabel}>Location</h2>
        <div className={`${s.card} ${p.row}`}>
          <div>
            <p className={p.rowTitle}>
              {location === 'granted' ? 'Location is on' : location === 'denied' ? 'Location is blocked' : 'Location not allowed yet'}
            </p>
            <p className={p.rowSub}>
              {location === 'denied'
                ? 'Turn it on for Halfway in your browser or phone settings.'
                : 'Used to find places near you and to share your position in a live meetup.'}
            </p>
          </div>
          {location !== 'granted' && location !== 'denied' && (
            <button type="button" className={s.respondPill} onClick={askLocation}>
              Allow
            </button>
          )}
        </div>
      </section>

      {/* ---- More ---- */}
      <section>
        <h2 className={s.sectionLabel}>More</h2>
        <div className={`${s.card} ${p.links}`}>
          <Link href="/auth/saved" className={p.link}>
            Saved searches <span aria-hidden="true">›</span>
          </Link>
          <Link href="/friends" className={p.link}>
            Meetups and friends <span aria-hidden="true">›</span>
          </Link>
          {signedIn ? (
            <>
              <button type="button" className={p.link} onClick={invite} disabled={busy === 'invite'}>
                {busy === 'invite' ? 'Opening share…' : 'Invite a friend'} <span aria-hidden="true">›</span>
              </button>
              <button type="button" className={`${p.link} ${p.danger}`} onClick={onSignOut}>
                Sign out
              </button>
            </>
          ) : (
            <Link href="/auth/login" className={p.link}>
              Sign in <span aria-hidden="true">›</span>
            </Link>
          )}
        </div>
      </section>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div className={s.page}>
      <div className={s.column}>
        <div className={s.topBar}>
          <Link href="/" className={s.backBtn} aria-label="Back to Halfway">
            <ArrowLeft />
          </Link>
          <div className={s.titleBlock}>
            <h1 className={s.pageTitle}>Profile</h1>
          </div>
          <ThemeToggle />
        </div>
        {children}
      </div>
    </div>
  );
}
