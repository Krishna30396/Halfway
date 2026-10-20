'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useFriends } from '@/lib/useFriends';
import Avatar from './Avatar';
import { displayName, initialOf } from '@/lib/social';
import NotificationToggle from './NotificationToggle';
import EmailAlerts from './EmailAlerts';
import UsernameSetup from './UsernameSetup';
import { CloseIcon, PeopleIcon, PlusIcon } from './meet/icons';
import s from './FriendsWidget.module.css';

// Full-screen flows where a floating button would get in the way.
const HIDDEN_ON = [/^\/friends/, /^\/profile/, /^\/meet\//, /^\/auth\//, /^\/dev\//];

// The hidden check runs before any data loading: on /friends the page loads
// its own copy, and loading here too doubled every query and realtime channel.
export const OPEN_FRIENDS_EVENT = 'halfway:open-friends';

export default function FriendsWidget() {
  const pathname = usePathname();
  if (HIDDEN_ON.some((re) => re.test(pathname || ''))) return null;
  return <FriendsWidgetPanel pathname={pathname} />;
}

function FriendsWidgetPanel({ pathname }) {
  const f = useFriends();
  return <FriendsWidgetView f={f} pathname={pathname} />;
}

/** The FAB + panel, given useFriends() data (exported so dev previews can pass sample data). */
export function FriendsWidgetView({ f, pathname, initialOpen = false }) {
  const router = useRouter();
  const [open, setOpen] = useState(initialOpen);
  const [addName, setAddName] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(null);
  // "Opening…" stays until the meetup screen replaces this one.
  const [opening, setOpening] = useState(null);
  const panelRef = useRef(null);
  const lastPath = useRef(pathname);

  // On the home screen the tab bar's centre button opens this panel.
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_FRIENDS_EVENT, show);
    return () => window.removeEventListener(OPEN_FRIENDS_EVENT, show);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (pathname === lastPath.current) return;
    lastPath.current = pathname;
    setOpen(false);
    setOpening(null);
  }, [pathname]);

  if (!f.configured) return null;

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

  const onAdd = (e) => {
    e.preventDefault();
    act('add', async () => {
      const text = await f.sendRequest(addName);
      setAddName('');
      return text;
    })();
  };

  const meetUp = (id) =>
    act(id, async () => {
      const meetId = await f.startMeetup(id);
      setOpening(id);
      router.push(`/meet/${meetId}`);
    })();

  const signedIn = !!f.user;
  const hasUsername = !!f.me?.username;
  const onHome = pathname === '/';

  return (
    <>
      {open && <div className={s.scrim} onClick={() => setOpen(false)} aria-hidden="true" />}

      {open && (
        <div
          ref={panelRef}
          className={`${s.panel} ${onHome ? s.panelHome : ''}`}
          role="dialog"
          aria-modal="true"
          aria-label="Friends"
          tabIndex={-1}
        >
          <header className={s.head}>
            <div>
              <h2 className={s.title}>Friends</h2>
              {hasUsername && (
                <p className={s.sub}>
                  You&apos;re <span className={s.handle}>@{f.me.username}</span>
                </p>
              )}
            </div>
            <button type="button" className={s.close} onClick={() => setOpen(false)} aria-label="Close">
              <CloseIcon width={18} height={18} />
            </button>
          </header>

          <div className={s.body}>
            {!signedIn ? (
              <div className={s.empty}>
                <p className={s.lead}>Meet friends halfway, live</p>
                <UsernameSetup onDone={f.reload} />
              </div>
            ) : !f.loaded ? (
              <div className={s.loading}>
                <span className={s.skel} />
                <span className={s.skel} />
                <span className={s.skel} />
              </div>
            ) : !hasUsername ? (
              <div className={s.empty}>
                <p className={s.lead}>Pick a username</p>
                <UsernameSetup onDone={f.reload} />
              </div>
            ) : (
              <>
                <button
                  type="button"
                  className={s.invite}
                  onClick={act('share', f.shareInvite)}
                  disabled={busy === 'share'}
                >
                  <span className={s.inviteIcon} aria-hidden="true">
                    <PlusIcon />
                  </span>
                  <span className={s.inviteText}>
                    <strong>{busy === 'share' ? 'Opening share…' : 'Invite a friend'}</strong>
                    Share your link on WhatsApp, SMS or anywhere
                  </span>
                </button>

                <form className={s.addRow} onSubmit={onAdd}>
                  <input
                    className={s.input}
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    placeholder="Add by username"
                    autoCapitalize="none"
                    aria-label="Friend's username"
                  />
                  <button type="submit" className={s.addBtn} disabled={busy === 'add' || !addName.trim()}>
                    {busy === 'add' ? 'Adding…' : 'Add'}
                  </button>
                </form>

                {f.inviteResult && (
                  <p className={f.inviteResult.err ? s.error : s.ok}>{f.inviteResult.text}</p>
                )}
                {msg && <p className={msg.err ? s.error : s.ok}>{msg.text}</p>}

                {f.meetups.length > 0 && (
                  <section>
                    <h3 className={s.section}>Meetups</h3>
                    <ul className={s.list}>
                      {f.meetups.map((m) => {
                        const other = m.created_by === f.user.id ? m.invitee : m.created_by;
                        const waiting = f.needsMe(m);
                        return (
                          <li key={m.id} className={s.item}>
                            <Avatar person={f.people[other]} className={s.avatar} />
                            <span className={s.info}>
                              <span className={s.name}>{displayName(f.people[other])}</span>
                              <span className={s.meta}>
                                <span className={`${s.dot} ${m.status === 'live' ? s.dotLive : ''}`} aria-hidden="true" />
                                {m.status === 'live'
                                  ? `Live · ${m.dest_name || 'on the way'}`
                                  : m.status === 'requested'
                                    ? m.invitee === f.user.id
                                      ? 'Wants to meet up'
                                      : 'Waiting for reply'
                                    : 'Picking a place'}
                              </span>
                            </span>
                            <Link href={`/meet/${m.id}`} className={waiting ? s.primarySm : s.secondarySm}>
                              {waiting ? 'Respond' : 'Open'}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}

                {f.incoming.length > 0 && (
                  <section>
                    <h3 className={s.section}>Friend requests</h3>
                    <ul className={s.list}>
                      {f.incoming.map((r) => (
                        <li key={r.id} className={s.item}>
                          <Avatar person={f.people[r.requester]} className={`${s.avatar} ${s.avatarInk}`} />
                          <span className={s.info}>
                            <span className={s.name}>{displayName(f.people[r.requester])}</span>
                            <span className={s.meta}>Wants to be friends</span>
                          </span>
                          <button
                            type="button"
                            className={s.primarySm}
                            onClick={act(r.id, () => f.accept(r))}
                            disabled={busy === r.id}
                          >
                            {busy === r.id ? '…' : 'Accept'}
                          </button>
                          <button
                            type="button"
                            className={s.iconSm}
                            onClick={act(r.id, () => f.remove(r))}
                            disabled={busy === r.id}
                            aria-label="Decline"
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <section>
                  <h3 className={s.section}>Your friends</h3>
                  {f.friends.length === 0 ? (
                    <p className={s.muted}>
                      No friends yet — tap <strong>Invite a friend</strong> above and send them the link.
                    </p>
                  ) : (
                    <ul className={s.list}>
                      {f.friends.map((fr) => {
                        const id = f.otherOf(fr);
                        const existing = f.meetupWith(id);
                        const pending = busy === id || opening === id;
                        return (
                          <li key={fr.id} className={s.item}>
                            <Avatar person={f.people[id]} className={`${s.avatar} ${s.avatarInk}`} />
                            <span className={s.info}>
                              <span className={s.name}>{displayName(f.people[id])}</span>
                              {f.people[id]?.username && (
                                <span className={s.meta}>@{f.people[id].username}</span>
                              )}
                            </span>
                            <button
                              type="button"
                              className={existing ? s.secondarySm : s.primarySm}
                              onClick={() => meetUp(id)}
                              disabled={pending}
                            >
                              {pending ? 'Opening…' : existing ? 'Open' : 'Meet up'}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {f.outgoing.length > 0 && (
                    <p className={s.muted} style={{ marginTop: 8 }}>
                      {f.outgoing.length} request{f.outgoing.length > 1 ? 's' : ''} waiting for a reply
                    </p>
                  )}
                </section>

                <NotificationToggle showTest />
                <EmailAlerts />
              </>
            )}
          </div>

          {signedIn && hasUsername && (
            <footer className={s.foot}>
              <Link href="/friends">Manage friends &amp; profile →</Link>
            </footer>
          )}
        </div>
      )}

      {/* Home has the tab bar, so the round button only appears there as the close ✕. */}
      {(!onHome || open) && (
      <button
        type="button"
        className={`${s.fab} ${open ? s.fabOpen : ''} ${onHome ? s.fabHome : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close friends' : 'Friends'}
        aria-expanded={open}
      >
        <span key={open ? "x" : "people"} className={open ? s.fabIconX : s.fabIcon} aria-hidden="true">
          {open ? <CloseIcon width={24} height={24} /> : <PeopleIcon />}
        </span>
        {!open && f.attentionCount > 0 && <span className={s.badge}>{f.attentionCount}</span>}
      </button>
      )}
    </>
  );
}
