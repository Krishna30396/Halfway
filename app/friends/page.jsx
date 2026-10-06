'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import NotificationToggle from '@/components/NotificationToggle';
import ThemeToggle from '@/components/ThemeToggle';
import { getSupabase } from '@/lib/supabase';
import { notify } from '@/lib/notify';
import { fetchProfiles, displayName, initialOf, USERNAME_RE } from '@/lib/social';
import s from '@/components/Social.module.css';

const STATUS_LABEL = {
  requested: 'Waiting for reply',
  planning: 'Picking a place',
  live: 'Live',
};

export default function FriendsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const supabase = getSupabase();

  const [me, setMe] = useState(null);
  const [friendships, setFriendships] = useState([]);
  const [meetups, setMeetups] = useState([]);
  const [people, setPeople] = useState({});
  const [loaded, setLoaded] = useState(false);

  const [editing, setEditing] = useState(false);
  const [unameDraft, setUnameDraft] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const [profileMsg, setProfileMsg] = useState(null);

  const [addName, setAddName] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    if (!supabase || !user) return;
    const [{ data: prof }, { data: fr }, { data: mu }] = await Promise.all([
      supabase.from('profiles').select('id, username, display_name').eq('id', user.id).maybeSingle(),
      supabase.from('friendships').select('*').order('created_at', { ascending: false }),
      supabase
        .from('meetups')
        .select('id, created_by, invitee, status, dest_name, updated_at')
        .in('status', ['requested', 'planning', 'live'])
        .order('updated_at', { ascending: false }),
    ]);
    const others = [
      ...(fr || []).map((f) => (f.requester === user.id ? f.addressee : f.requester)),
      ...(mu || []).map((m) => (m.created_by === user.id ? m.invitee : m.created_by)),
    ];
    setPeople(await fetchProfiles(others));
    setMe(prof || { id: user.id });
    setFriendships(fr || []);
    setMeetups(mu || []);
    setLoaded(true);
  }, [supabase, user]);

  useEffect(() => {
    if (authLoading || !user || !supabase) return;
    load();
    const channel = supabase
      .channel(`friends-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meetups' }, load)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [authLoading, user, supabase, load]);

  // Invite links look like /friends?add=username
  useEffect(() => {
    const add = new URLSearchParams(window.location.search).get('add');
    if (add) setAddName(add);
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

  const otherOf = (f) => (f.requester === user.id ? f.addressee : f.requester);
  const incoming = friendships.filter((f) => f.status === 'pending' && f.addressee === user.id);
  const outgoing = friendships.filter((f) => f.status === 'pending' && f.requester === user.id);
  const friends = friendships.filter((f) => f.status === 'accepted');
  const meetupWith = (id) => meetups.find((m) => m.created_by === id || m.invitee === id);

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
    load();
  };

  const startEdit = () => {
    setUnameDraft(me?.username || '');
    setNameDraft(me?.display_name || '');
    setProfileMsg(null);
    setEditing(true);
  };

  const shareInvite = async () => {
    const url = `${window.location.origin}/friends?add=${me.username}`;
    const text = `Add me on Halfway so we can meet up: ${url}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Halfway', text, url });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setMsg({ text: 'Invite link copied — send it to your friend.' });
    } catch {
      window.prompt('Copy your invite link', url);
    }
  };

  const addFriend = async (e) => {
    e.preventDefault();
    const uname = addName.trim().replace(/^@/, '').toLowerCase();
    setMsg(null);
    if (!USERNAME_RE.test(uname)) {
      setMsg({ err: true, text: 'Enter their exact username (letters, numbers, _).' });
      return;
    }
    if (uname === me?.username) {
      setMsg({ err: true, text: "That's your own username." });
      return;
    }
    setBusy('add');
    try {
      const { data: found, error: findError } = await supabase.rpc('find_profile_by_username', { u: uname });
      if (findError) throw findError;
      const target = found?.[0];
      if (!target) {
        setMsg({ err: true, text: `No one is called @${uname} yet. Check the spelling.` });
        return;
      }
      const existing = friendships.find((f) => otherOf(f) === target.id);
      if (existing?.status === 'accepted') {
        setMsg({ text: `You're already friends with ${displayName(target)}.` });
        return;
      }
      if (existing && existing.requester === target.id) {
        await accept(existing);
        return;
      }
      if (existing) {
        setMsg({ text: 'Request already sent — waiting for them to accept.' });
        return;
      }
      const { data, error } = await supabase
        .from('friendships')
        .insert({ requester: user.id, addressee: target.id })
        .select()
        .single();
      if (error) throw error;
      notify('friend_request', data.id);
      setAddName('');
      setMsg({ text: `Friend request sent to ${displayName(target)}.` });
      window.history.replaceState(null, '', '/friends');
      load();
    } catch (err) {
      setMsg({ err: true, text: err.code === '23505' ? 'You two are already connected.' : err.message });
    } finally {
      setBusy(null);
    }
  };

  const accept = async (f) => {
    setBusy(f.id);
    const { error } = await supabase.from('friendships').update({ status: 'accepted' }).eq('id', f.id);
    setBusy(null);
    if (error) {
      setMsg({ err: true, text: error.message });
      return;
    }
    notify('friend_accepted', f.id);
    setMsg({ text: `You and ${displayName(people[otherOf(f)])} are now friends.` });
    load();
  };

  const remove = async (f, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(f.id);
    const { error } = await supabase.from('friendships').delete().eq('id', f.id);
    setBusy(null);
    if (error) setMsg({ err: true, text: error.message });
    load();
  };

  const meetUp = async (friendId) => {
    const open = meetupWith(friendId);
    if (open) {
      router.push(`/meet/${open.id}`);
      return;
    }
    setBusy(friendId);
    const { data, error } = await supabase
      .from('meetups')
      .insert({ created_by: user.id, invitee: friendId })
      .select()
      .single();
    if (error) {
      setBusy(null);
      setMsg({ err: true, text: error.message });
      return;
    }
    await notify('meet_request', data.id);
    router.push(`/meet/${data.id}`);
  };

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
