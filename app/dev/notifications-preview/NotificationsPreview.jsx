'use client';

import { useState } from 'react';
import { TEST_ALERT, friendText, meetupText } from '@/lib/notifyText';
import styles from './NotificationsPreview.module.css';

// Same words the notify route sends, worded for you with "paani" as the sender.
const N = 'paani';
const PLACE = { name: 'IRA Cafe', lat: 17.43, lng: 78.45 };
const meet = (type, extra = {}) => meetupText(type, { n: N, place: PLACE, status: 'live', ...extra });

const GROUPS = [
  {
    title: 'Friends',
    items: [
      { type: 'friend_request', msg: friendText('friend_request', `@${N}`), when: `When ${N} sends you a friend request` },
      { type: 'friend_accepted', msg: friendText('friend_accepted', `@${N}`), when: `When ${N} accepts your friend request` },
    ],
  },
  {
    title: 'Planning',
    items: [
      { type: 'meet_request', msg: meet('meet_request', { place: null, status: 'requested' }), when: `When ${N} asks you to meet up` },
      {
        type: 'meet_accepted',
        msg: meet('meet_accepted', { place: null, status: 'planning', apart: '3.4 km' }),
        when: `When ${N} accepts your meetup request (both locations known)`,
      },
      {
        type: 'meet_accepted',
        variant: 'distance unknown',
        msg: meet('meet_accepted', { place: null, status: 'planning' }),
        when: 'Same, before either location has been shared',
      },
      { type: 'meet_declined', msg: meet('meet_declined', { place: null, status: 'declined' }), when: `When ${N} declines your meetup request` },
      { type: 'meet_cancelled', msg: meet('meet_cancelled', { place: null, status: 'cancelled' }), when: `When ${N} cancels a request they sent you` },
      {
        type: 'place_proposed',
        msg: meet('place_proposed', { status: 'planning', away: { mine: '1.8 km', theirs: '1.6 km' } }),
        when: `When ${N} suggests a place (your location known)`,
      },
      {
        type: 'place_proposed',
        variant: 'distance unknown',
        msg: meet('place_proposed', { status: 'planning' }),
        when: 'Same, before your location has been shared',
      },
      { type: 'place_rejected', msg: meet('place_rejected', { status: 'planning' }), when: `When ${N} passes on the place you suggested` },
      {
        type: 'place_agreed',
        msg: meet('place_agreed', { away: { mine: '1.8 km', theirs: '1.6 km' }, eta: '~7 min' }),
        when: `When ${N} accepts the place and live tracking starts (in a group: when the last person accepts)`,
      },
      {
        type: 'place_agreed',
        variant: 'no distance or ETA yet',
        msg: meet('place_agreed'),
        when: 'Same, before locations or an ETA are known',
      },
    ],
  },
  {
    title: 'On the way',
    items: [
      { type: 'almost_there', msg: meet('almost_there'), when: `Once, when ${N} is ~5 min or 500 m from the place` },
      { type: 'arrived', msg: meet('arrived'), when: `Once, when ${N} is within ~150 m of the place (up to 300 m when their GPS is rough)` },
      { type: 'meet_ended', msg: meet('meet_ended', { status: 'ended' }), when: `When ${N} ends the meetup for everyone` },
    ],
  },
  {
    title: 'Group',
    items: [
      {
        type: 'member_invited',
        msg: meet('member_invited', { status: 'planning' }),
        when: `When ${N} adds you to a meetup that's still picking a place (sent to you only)`,
      },
      {
        type: 'member_invited',
        variant: 'meetup already live',
        msg: meet('member_invited'),
        when: `When ${N} adds you to a meetup already heading somewhere`,
      },
      { type: 'member_joined', msg: meet('member_joined', { status: 'planning' }), when: `When ${N} accepts an invite to your meetup` },
      { type: 'member_left', msg: meet('member_left'), when: `When ${N} leaves a group meetup (it carries on for the rest)` },
    ],
  },
  {
    title: 'Other',
    items: [{ type: 'test', msg: TEST_ALERT, when: 'When you tap "Send a test alert" — only to your own devices' }],
  },
];

function Notification({ msg, expanded }) {
  return (
    <div className={`${styles.note} ${expanded ? styles.expanded : ''}`}>
      <div className={styles.head}>
        <img className={styles.icon} src="/icons/icon-192.png" alt="" />
        <span>Halfway · now</span>
      </div>
      <div className={styles.title}>{msg.title}</div>
      <div className={styles.preview}>{msg.preview}</div>
    </div>
  );
}

export default function NotificationsPreview() {
  const [expanded, setExpanded] = useState(false);
  return (
    <main className={styles.page}>
      <header className={styles.top}>
        <h1>Notifications</h1>
        <p>
          What each push alert looks like for the person receiving it — the same words go to Android, the browser and the
          email subject.
        </p>
        <div className={styles.toggle} role="group" aria-label="Notification size">
          <button type="button" aria-pressed={!expanded} onClick={() => setExpanded(false)}>
            Heads-up
          </button>
          <button type="button" aria-pressed={expanded} onClick={() => setExpanded(true)}>
            Expanded
          </button>
        </div>
      </header>

      {GROUPS.map((g) => (
        <section key={g.title} className={styles.group}>
          <h2>{g.title}</h2>
          {g.items.map((it) => (
            <article key={`${it.type}-${it.variant || ''}`} className={styles.item}>
              <Notification msg={it.msg} expanded={expanded} />
              <p className={styles.when}>{it.when}</p>
              <p className={styles.meta}>
                <code>{it.type}</code>
                {it.variant && <span> · {it.variant}</span>}
                {it.msg.button && <span> · Email button: “{it.msg.button}”</span>}
              </p>
            </article>
          ))}
        </section>
      ))}
    </main>
  );
}
