'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useFriends } from '@/lib/useFriends';
import { displayName, initialOf } from '@/lib/social';
import NotificationToggle from './NotificationToggle';
import EmailAlerts from './EmailAlerts';
import UsernameSetup from './UsernameSetup';
import s from './FriendsWidget.module.css';

// Full-screen flows where a floating button would get in the way.
const HIDDEN_ON = [/^\/friends/, /^\/meet\//, /^\/auth\//, /^\/dev\//];

function PeopleIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export default function FriendsWidget() {
  const pathname = usePathname();
  const router = useRouter();
  const f = useFriends();
  const [open, setOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => setOpen(false), [pathname]);

  if (!f.configured || HIDDEN_ON.some((re) => re.test(pathname || ''))) return null;

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
      router.push(`/meet/${meetId}`);
    })();

  const signedIn = !!f.user;
  const hasUsername = !!f.me?.username;

  return (
    <>
      {open && <div className={s.scrim} onClick={() => setOpen(false)} aria-hidden="true" />}

      {open && (
        <div
          ref={panelRef}
          className={s.panel}
          role="dialog"
          aria-modal="true"
          aria-label="Friends"
          tabIndex={-1}
        >
          <header className={s.head}>
            <div>
              <h2 className={s.title}>Friends</h2>
              {hasUsername && <p className={s.sub}>You&apos;re @{f.me.username}</p>}
            </div>
            <button type="button" className={s.close} onClick={() => setOpen(false)} aria-label="Close">
              ×
            </button>
          </header>

          <div className={s.body}>
            {!signedIn ? (
              <div className={s.empty}>
                <p className={s.lead}>Meet friends halfway, live</p>
                <UsernameSetup onDone={f.reload} />
              </div>
            ) : !f.loaded ? (
              <p className={s.muted}>Loading…</p>
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
                  <span className={s.inviteIcon} aria-hidden="true">+</span>
                  <span>
                    <strong>Invite a friend</strong>
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
                  <button type="submit" className={s.primary} disabled={busy === 'add' || !addName.trim()}>
                    {busy === 'add' ? '…' : 'Add'}
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
                            <span className={s.avatar}>{initialOf(f.people[other])}</span>
                            <span className={s.info}>
                              <span className={s.name}>{displayName(f.people[other])}</span>
                              <span className={s.meta}>
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
                          <span className={s.avatar}>{initialOf(f.people[r.requester])}</span>
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
                            Accept
                          </button>
                          <button
                            type="button"
                            className={s.secondarySm}
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
                        return (
                          <li key={fr.id} className={s.item}>
                            <span className={s.avatar}>{initialOf(f.people[id])}</span>
                            <span className={s.info}>
                              <span className={s.name}>{displayName(f.people[id])}</span>
                              {f.people[id]?.username && (
                                <span className={s.meta}>@{f.people[id].username}</span>
                              )}
                            </span>
                            <button
                              type="button"
                              className={s.primarySm}
                              onClick={() => meetUp(id)}
                              disabled={busy === id}
                            >
                              {busy === id ? '…' : existing ? 'Open' : 'Meet up'}
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
              <Link href="/friends">Manage friends & profile →</Link>
            </footer>
          )}
        </div>
      )}

      <button
        type="button"
        className={s.fab}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close friends' : 'Friends'}
        aria-expanded={open}
      >
        {open ? <span className={s.fabX}>×</span> : <PeopleIcon />}
        {!open && f.attentionCount > 0 && <span className={s.badge}>{f.attentionCount}</span>}
      </button>
    </>
  );
}
