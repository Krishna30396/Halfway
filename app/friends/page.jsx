'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import NotificationToggle from '@/components/NotificationToggle';
import ThemeToggle from '@/components/ThemeToggle';
import { getSupabase } from '@/lib/supabase';
import { useFriends } from '@/lib/useFriends';
import { displayName, initialOf, savePendingInvite, USERNAME_RE } from '@/lib/social';
import s from '@/components/Social.module.css';

const STATUS_LABEL = {
  requested: 'Waiting for reply',
  planning: 'Picking a place',
  live: 'Live',
};

export default function FriendsPage() {
  const router = useRouter();
  const supabase = getSupabase();
  const f = useFriends();
  const { user, authLoading, loaded, me, meetups, people, incoming, outgoing, friends, otherOf, meetupWith } = f;

  const [editing, setEditing] = useState(false);
  const [unameDraft, setUnameDraft] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const [profileMsg, setProfileMsg] = useState(null);

  const [addName, setAddName] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(null);

  // Invite links look like /friends?add=username
  useEffect(() => {
    const add = new URLSearchParams(window.location.search).get('add');
    if (add && USERNAME_RE.test(add.toLowerCase())) {
      savePendingInvite(add);
      window.history.replaceState(null, '', '/friends');
    }
  }, []);

  const needsUsername = loaded && !me?.username;
  useEffect(() => {
    if (needsUsername) {
      setEditing(true);
      setNameDraft(me?.display_name || '');
    }
  }, [needsUsername, me?.display_name]);

  if (!supabase) {
    return (
      <Shell>
        <div className={s.card}>
          <p className={s.muted}>
            Friends and live meetups need accounts. Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to turn them on.
          </p>
        </div>
      </Shell>
    );
  }

  if (authLoading || (user && !loaded)) {
    return (
      <Shell>
        <p className={s.muted}>Loading…</p>
      </Shell>
    );
  }

  if (!user) {
    return (
      <Shell>
        <div className={s.card}>
          <h2 className={s.meetTitle}>Meet friends halfway, live</h2>
          <p className={s.muted} style={{ marginTop: 8 }}>
            Sign in to add friends, send meetup requests, agree on a place, and see each other
            moving towards it in real time.
          </p>
          <div className={s.actions}>
            <Link href="/auth/login" className={s.primary}>Sign in</Link>
            <Link href="/auth/signup" className={s.secondary}>Create account</Link>
          </div>
        </div>
      </Shell>
    );
  }

  const act = (key, fn) => async () => {
    setBusy(key);
    setMsg(null);
    try {
      const text = await fn();
      if (text) setMsg({ text });
    } catch (err) {
      setMsg({ err: true, text: err.message || 'Something went wrong.' });
    } finally {
      setBusy(null);
    }
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    const uname = unameDraft.trim().replace(/^@/, '').toLowerCase();
    if (!USERNAME_RE.test(uname)) {
      setProfileMsg({ err: true, text: 'Usernames are 3–20 characters: lowercase letters, numbers and _.' });
      return;
    }
    setBusy('profile');
    setProfileMsg(null);
    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      username: uname,
      display_name: nameDraft.trim() || null,
      updated_at: new Date().toISOString(),
    });
    setBusy(null);
    if (error) {
      setProfileMsg({
        err: true,
        text: error.code === '23505' ? 'That username is taken — try another.' : error.message,
      });
      return;
    }
    setEditing(false);
    f.reload();
  };

  const startEdit = () => {
    setUnameDraft(me?.username || '');
    setNameDraft(me?.display_name || '');
    setProfileMsg(null);
    setEditing(true);
  };

  const shareInvite = act('share', f.shareInvite);

  const addFriend = (e) => {
    e.preventDefault();
    act('add', async () => {
      const text = await f.sendRequest(addName);
      setAddName('');
      window.history.replaceState(null, '', '/friends');
      return text;
    })();
  };

  const accept = (fr) => act(fr.id, () => f.accept(fr))();

  const remove = (fr, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    act(fr.id, () => f.remove(fr))();
  };

  const meetUp = (friendId) =>
    act(friendId, async () => {
      const id = await f.startMeetup(friendId);
      router.push(`/meet/${id}`);
    })();

  return (
    <Shell>
      {/* ---- You ---- */}
      <section className={s.card}>
        <h2 className={s.cardTitle}>You</h2>
        {editing ? (
          <form onSubmit={saveProfile}>
            {needsUsername && (
              <p className={s.muted} style={{ marginBottom: 12 }}>
                Pick a username so friends can find you.
              </p>
            )}
            <div className={s.field}>
              <label className={s.label} htmlFor="uname">Username</label>
              <input
                id="uname"
                className={s.input}
                value={unameDraft}
                onChange={(e) => setUnameDraft(e.target.value.toLowerCase())}
                placeholder="e.g. krishna"
                autoCapitalize="none"
                autoComplete="username"
                maxLength={21}
                required
              />
            </div>
            <div className={s.field}>
              <label className={s.label} htmlFor="dname">Display name (optional)</label>
              <input
                id="dname"
                className={s.input}
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder="e.g. Krishna"
                maxLength={40}
              />
            </div>
            {profileMsg && <p className={profileMsg.err ? s.error : s.ok} style={{ marginTop: 12 }}>{profileMsg.text}</p>}
            <div className={s.actions}>
              <button type="submit" className={s.primary} disabled={busy === 'profile'}>
                {busy === 'profile' ? 'Saving…' : 'Save'}
              </button>
              {!needsUsername && (
                <button type="button" className={s.secondary} onClick={() => setEditing(false)}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        ) : (
          <>
            <div className={s.person} style={{ padding: 0 }}>
              <div className={s.avatar}>{initialOf(me)}</div>
              <div className={s.personInfo}>
                <div className={s.personName}>{me.display_name || `@${me.username}`}</div>
                <div className={s.personSub}>@{me.username}</div>
              </div>
              <button type="button" className={`${s.secondary} ${s.small}`} onClick={startEdit}>
                Edit
              </button>
            </div>
            <div className={s.actions}>
              <button type="button" className={s.secondary} onClick={shareInvite}>
                Share my invite link
              </button>
            </div>
          </>
        )}
      </section>

      <NotificationToggle />

      {/* ---- Live / pending meetups ---- */}
      {meetups.length > 0 && (
        <section className={s.card}>
          <h2 className={s.cardTitle}>Meetups</h2>
          <ul className={s.list}>
            {meetups.map((m) => {
              const other = m.created_by === user.id ? m.invitee : m.created_by;
              const waitingOnMe = m.status === 'requested' && m.invitee === user.id;
              return (
                <li key={m.id} className={s.person}>
                  <div className={`${s.avatar} ${s.avatarAlt}`}>{initialOf(people[other])}</div>
                  <div className={s.personInfo}>
                    <div className={s.personName}>{displayName(people[other])}</div>
                    <div className={s.personSub}>
                      {waitingOnMe
                        ? 'Wants to meet up with you'
                        : m.status === 'live' && m.dest_name
                          ? `Heading to ${m.dest_name}`
                          : STATUS_LABEL[m.status]}
                    </div>
                  </div>
                  {m.status === 'live' && <span className={`${s.pill} ${s.pillLive}`}>Live</span>}
                  <Link href={`/meet/${m.id}`} className={`${waitingOnMe ? s.primary : s.secondary} ${s.small}`}>
                    {waitingOnMe ? 'Respond' : 'Open'}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ---- Incoming requests ---- */}
      {incoming.length > 0 && (
        <section className={s.card}>
          <h2 className={s.cardTitle}>
            Friend requests <span className={s.count}>{incoming.length}</span>
          </h2>
          <ul className={s.list}>
            {incoming.map((f) => {
              const p = people[f.requester];
              return (
                <li key={f.id} className={s.person}>
                  <div className={`${s.avatar} ${s.avatarAlt}`}>{initialOf(p)}</div>
                  <div className={s.personInfo}>
                    <div className={s.personName}>{displayName(p)}</div>
                    {p?.username && <div className={s.personSub}>@{p.username}</div>}
                  </div>
                  <div className={s.personActions}>
                    <button
                      type="button"
                      className={`${s.primary} ${s.small}`}
                      onClick={() => accept(f)}
                      disabled={busy === f.id}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      className={`${s.secondary} ${s.small}`}
                      onClick={() => remove(f)}
                      disabled={busy === f.id}
                    >
                      Decline
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ---- Friends ---- */}
      <section className={s.card}>
        <h2 className={s.cardTitle}>
          Friends {friends.length > 0 && <span className={s.count}>{friends.length}</span>}
        </h2>
        {friends.length === 0 ? (
          <p className={s.muted}>
            No friends yet. Add someone by username below, or share your invite link.
          </p>
        ) : (
          <ul className={s.list}>
            {friends.map((f) => {
              const id = otherOf(f);
              const p = people[id];
              const open = meetupWith(id);
              return (
                <li key={f.id} className={s.person}>
                  <div className={`${s.avatar} ${s.avatarAlt}`}>{initialOf(p)}</div>
                  <div className={s.personInfo}>
                    <div className={s.personName}>{displayName(p)}</div>
                    {p?.username && <div className={s.personSub}>@{p.username}</div>}
                  </div>
                  <div className={s.personActions}>
                    <button
                      type="button"
                      className={`${s.primary} ${s.small}`}
                      onClick={() => meetUp(id)}
                      disabled={busy === id}
                    >
                      {busy === id ? '…' : open ? 'Open meetup' : 'Meet up'}
                    </button>
                    <button
                      type="button"
                      className={`${s.secondary} ${s.small}`}
                      aria-label={`Remove ${displayName(p)}`}
                      onClick={() => remove(f, `Remove ${displayName(p)} from your friends?`)}
                      disabled={busy === f.id}
                    >
                      ×
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ---- Add a friend ---- */}
      <section className={s.card}>
        <h2 className={s.cardTitle}>Add a friend</h2>
        <form className={s.row} onSubmit={addFriend}>
          <input
            className={s.input}
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            placeholder="Their username"
            autoCapitalize="none"
            aria-label="Friend's username"
            disabled={!me?.username}
          />
          <button type="submit" className={s.primary} disabled={busy === 'add' || !me?.username}>
            {busy === 'add' ? '…' : 'Add'}
          </button>
        </form>
        {f.inviteResult && (
          <p className={f.inviteResult.err ? s.error : s.ok} style={{ marginTop: 10 }}>
            {f.inviteResult.text}
          </p>
        )}
        {msg && <p className={msg.err ? s.error : s.ok} style={{ marginTop: 10 }}>{msg.text}</p>}

        {outgoing.length > 0 && (
          <>
            <p className={s.hint} style={{ marginTop: 14 }}>Waiting for them to accept</p>
            <ul className={s.list}>
              {outgoing.map((f) => {
                const p = people[f.addressee];
                return (
                  <li key={f.id} className={s.person}>
                    <div className={`${s.avatar} ${s.avatarAlt}`}>{initialOf(p)}</div>
                    <div className={s.personInfo}>
                      <div className={s.personName}>{displayName(p)}</div>
                      <div className={s.personSub}>Request sent</div>
                    </div>
                    <button
                      type="button"
                      className={`${s.secondary} ${s.small}`}
                      onClick={() => remove(f)}
                      disabled={busy === f.id}
                    >
                      Cancel
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div className={s.page}>
      <div className={s.column}>
        <div className={s.topBar}>
          <Link href="/" className={s.back}>← Halfway</Link>
          <h1 className={s.logo}>FRIENDS</h1>
          <ThemeToggle />
        </div>
        {children}
      </div>
    </div>
  );
}
