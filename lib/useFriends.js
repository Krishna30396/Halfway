'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { getSupabase } from './supabase';
import { notify } from './notify';
import { fetchProfiles, displayName, takePendingInvite, hasPendingInvite, USERNAME_RE } from './social';

const OPEN_STATUSES = ['requested', 'planning', 'live'];

// The last list seen on this phone, shown instantly on the next visit while
// fresh data loads — on a slow connection the database can take seconds.
const cacheKey = (userId) => `halfway-friends:${userId}`;
function readCache(userId) {
  try {
    const c = JSON.parse(localStorage.getItem(cacheKey(userId)));
    return c && Array.isArray(c.friendships) ? c : null;
  } catch {
    return null;
  }
}
function writeCache(userId, data) {
  try {
    localStorage.setItem(cacheKey(userId), JSON.stringify(data));
  } catch {
    // storage full or blocked — the next visit just loads normally
  }
}

/** Friends, requests and open meetups for the signed-in user, kept live via realtime. */
export function useFriends() {
  const { user, loading: authLoading } = useAuth();
  const supabase = getSupabase();
  const channelId = useId();
  const [state, setState] = useState({
    loaded: false,
    me: null,
    friendships: [],
    meetups: [],
    people: {},
  });
  const [inviteResult, setInviteResult] = useState(null);
  const loadRef = useRef(null);

  const load = useCallback(async () => {
    if (!supabase || !user) return;
    const [{ data: me }, { data: friendships }, { data: meetups }] = await Promise.all([
      supabase.from('profiles').select('id, username, display_name').eq('id', user.id).maybeSingle(),
      supabase.from('friendships').select('*').order('created_at', { ascending: false }),
      supabase
        .from('meetups')
        .select('id, created_by, invitee, status, proposed_by, dest_name, updated_at')
        .in('status', OPEN_STATUSES)
        .order('updated_at', { ascending: false }),
    ]);
    const others = [
      ...(friendships || []).map((f) => (f.requester === user.id ? f.addressee : f.requester)),
      ...(meetups || []).map((m) => (m.created_by === user.id ? m.invitee : m.created_by)),
    ];
    const people = await fetchProfiles(others);
    const next = {
      me: me || { id: user.id },
      friendships: friendships || [],
      meetups: meetups || [],
      people,
    };
    setState({ loaded: true, ...next });
    writeCache(user.id, next);
  }, [supabase, user]);
  // Callers (e.g. right after a guest account is created) must hit the newest closure.
  loadRef.current = load;

  useEffect(() => {
    if (!user) return;
    const cached = readCache(user.id);
    if (cached) setState((s) => (s.loaded ? s : { loaded: true, ...cached }));
  }, [user]);

  useEffect(() => {
    if (authLoading || !user || !supabase) return;
    load();
    const channel = supabase
      .channel(`friends-${user.id}-${channelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meetups' }, load)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [authLoading, user, supabase, load, channelId]);

  const { me, friendships, meetups, people } = state;
  const otherOf = (f) => (f.requester === user?.id ? f.addressee : f.requester);
  const incoming = friendships.filter((f) => f.status === 'pending' && f.addressee === user?.id);
  const outgoing = friendships.filter((f) => f.status === 'pending' && f.requester === user?.id);
  const friends = friendships.filter((f) => f.status === 'accepted');
  const meetupWith = (id) => meetups.find((m) => m.created_by === id || m.invitee === id);
  const needsMe = (m) =>
    (m.status === 'requested' && m.invitee === user?.id) ||
    (m.status === 'planning' && m.proposed_by && m.proposed_by !== user?.id);
  const attentionCount = incoming.length + meetups.filter(needsMe).length;

  const accept = async (f) => {
    const { error } = await supabase.from('friendships').update({ status: 'accepted' }).eq('id', f.id);
    if (error) throw error;
    notify('friend_accepted', f.id);
    await load();
    return `You and ${displayName(people[otherOf(f)])} are now friends.`;
  };

  const remove = async (f) => {
    const { error } = await supabase.from('friendships').delete().eq('id', f.id);
    if (error) throw error;
    await load();
  };

  /** Returns a message to show; throws with a readable message on failure. */
  const sendRequest = async (raw) => {
    const uname = raw.trim().replace(/^@/, '').toLowerCase();
    if (!USERNAME_RE.test(uname)) throw new Error('Enter their exact username (letters, numbers, _).');
    if (uname === me?.username) throw new Error("That's your own username.");

    const { data: found, error: findError } = await supabase.rpc('find_profile_by_username', { u: uname });
    if (findError) throw findError;
    const target = found?.[0];
    if (!target) throw new Error(`No one is called @${uname} yet. Check the spelling.`);

    const existing = friendships.find((f) => otherOf(f) === target.id);
    if (existing?.status === 'accepted') return `You're already friends with ${displayName(target)}.`;
    if (existing && existing.requester === target.id) return accept(existing);
    if (existing) return 'Request already sent — waiting for them to accept.';

    const { data, error } = await supabase
      .from('friendships')
      .insert({ requester: user.id, addressee: target.id })
      .select()
      .single();
    if (error) {
      if (error.code === '23505') return 'You two are already connected.';
      throw error;
    }
    notify('friend_request', data.id);
    await load();
    return `Friend request sent to ${displayName(target)}.`;
  };

  // Send the friend request from an invite link once the user can (signed in + username).
  useEffect(() => {
    if (!state.loaded || !me?.username || !hasPendingInvite()) return;
    const target = takePendingInvite();
    if (!target || target === me.username) return;
    sendRequest(target)
      .then((text) => setInviteResult({ text }))
      .catch((err) => setInviteResult({ err: true, text: err.message }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.loaded, me?.username]);

  /** Opens the existing meetup with this friend, or creates one. Returns its id. */
  const startMeetup = async (friendId) => {
    const open = meetupWith(friendId);
    if (open) return open.id;
    const { data, error } = await supabase
      .from('meetups')
      .insert({ created_by: user.id, invitee: friendId })
      .select()
      .single();
    if (error) throw error;
    await notify('meet_request', data.id);
    return data.id;
  };

  /** Native share sheet on phones, clipboard elsewhere. Returns a message or null. */
  const shareInvite = async () => {
    if (!me?.username) return null;
    const url = `${window.location.origin}/friends?add=${me.username}`;
    const text = `Add me on Halfway so we can meet up: ${url}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Halfway', text, url });
        return null;
      } catch (err) {
        if (err.name === 'AbortError') return null;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      return 'Invite link copied — send it to your friend.';
    } catch {
      window.prompt('Copy your invite link', url);
      return null;
    }
  };

  return {
    user,
    authLoading,
    configured: !!supabase,
    ...state,
    reload: () => loadRef.current?.(),
    inviteResult,
    otherOf,
    incoming,
    outgoing,
    friends,
    meetupWith,
    needsMe,
    attentionCount,
    accept,
    remove,
    sendRequest,
    startMeetup,
    shareInvite,
  };
}
