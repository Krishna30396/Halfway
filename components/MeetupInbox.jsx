'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { getSupabase } from '@/lib/supabase';
import { enablePush, nativePushPermission, nativePushRegistered } from '@/lib/push';
import { isNativeApp } from '@/lib/native';
import { fetchProfiles, displayName } from '@/lib/social';
import s from './Social.module.css';

// While the app is open, surface anything waiting on you as a banner — push
// notifications cover the case where it's closed.
export default function MeetupInbox() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [items, setItems] = useState([]);
  const [dismissed, setDismissed] = useState({});

  useEffect(() => {
    if (!user) {
      setItems([]);
      return;
    }
    const supabase = getSupabase();
    if (!supabase) return;

    // Push endpoints rotate; re-save silently whenever permission is already granted.
    if (isNativeApp()) {
      nativePushPermission()
        .then((p) => p === 'granted' && !nativePushRegistered() && enablePush(user.id))
        .catch(() => {});
    } else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      enablePush(user.id).catch(() => {});
    }

    let alive = true;
    const load = async () => {
      const [{ data: meets }, { data: requests }] = await Promise.all([
        supabase
          .from('meetups')
          .select('id, created_by, invitee, status, proposed_by, proposal_name, updated_at')
          .in('status', ['requested', 'planning'])
          .order('updated_at', { ascending: false })
          .limit(10),
        supabase
          .from('friendships')
          .select('id, requester')
          .eq('addressee', user.id)
          .eq('status', 'pending'),
      ]);

      const next = [];
      for (const m of meets || []) {
        const other = m.created_by === user.id ? m.invitee : m.created_by;
        if (m.status === 'requested' && m.invitee === user.id) {
          next.push({ key: `req-${m.id}`, meetId: m.id, other, kind: 'request' });
        } else if (m.status === 'planning' && m.proposed_by && m.proposed_by !== user.id) {
          next.push({
            key: `prop-${m.id}-${m.updated_at}`,
            meetId: m.id,
            other,
            kind: 'proposal',
            place: m.proposal_name,
          });
        }
      }
      for (const f of requests || []) {
        next.push({ key: `friend-${f.id}`, other: f.requester, kind: 'friend' });
      }

      const people = await fetchProfiles(next.map((i) => i.other));
      if (alive) setItems(next.map((i) => ({ ...i, name: displayName(people[i.other]) })));
    };

    load();
    const channel = supabase
      .channel(`inbox-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meetups' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, load)
      .subscribe();
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      alive = false;
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user]);

  const visible = items.filter(
    (i) =>
      !dismissed[i.key] &&
      !(i.meetId && pathname === `/meet/${i.meetId}`) &&
      !(i.kind === 'friend' && pathname === '/friends')
  );
  if (!visible.length) return null;

  const item = visible[0];
  const text =
    item.kind === 'request'
      ? `${item.name} wants to meet up`
      : item.kind === 'proposal'
        ? `${item.name} suggested ${item.place}`
        : `${item.name} sent you a friend request`;

  return (
    <div className={s.inbox} role="alert">
      <span className={s.inboxDot} aria-hidden="true" />
      <span className={s.inboxText}>{text}</span>
      <Link href={item.meetId ? `/meet/${item.meetId}` : '/friends'} className={s.inboxAction}>
        View
      </Link>
      <button
        type="button"
        className={s.inboxClose}
        aria-label="Dismiss"
        onClick={() => setDismissed((d) => ({ ...d, [item.key]: true }))}
      >
        ×
      </button>
    </div>
  );
}
