'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import { fmtKm, fmtMin } from '@/lib/navigation';
import { haversine } from '@/lib/geo';
import { approxMinutes } from './tokens';
import { ArrowLeft, BellIcon, ChevronDown, FitIcon, NavIcon, CloseIcon, PinIcon } from './icons';
import m from './Meet.module.css';

const firstName = (p) => {
  const n = (p?.display_name || '').trim().split(/\s+/)[0];
  return n || (p?.username ? `@${p.username}` : 'there');
};

/**
 * Floating header: "Hi Krishna @krishna" pill, alerts bell, theme toggle.
 * The pill and bell open a small menu (back to friends, notifications, …).
 */
export function MeetHeader({ me, letter, alert, menu, children }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className={m.top}>
      {open && <div className={m.menuScrim} onClick={() => setOpen(false)} aria-hidden="true" />}
      <div className={m.headRow}>
        <button
          type="button"
          className={m.userPill}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="true"
          aria-label="Meetup menu"
        >
          <span className={m.userAvatar} aria-hidden="true">{letter}</span>
          <span className={m.userText}>
            <strong>Hi {firstName(me)}</strong>
            <span>
              {me?.username ? `@${me.username}` : 'Meetup'}
              <ChevronDown />
            </span>
          </span>
        </button>
        <span className={m.spacer} />
        <button
          type="button"
          className={m.iconBtn}
          onClick={() => setOpen((o) => !o)}
          aria-label={alert ? `Alerts: ${alert}` : 'Alerts'}
        >
          <BellIcon />
          {alert && <span className={m.bellDot} aria-hidden="true" />}
        </button>
        <span className={m.themeWrap}>
          <ThemeToggle />
        </span>
      </div>

      {open ? (
        <div className={m.menu} role="menu">
          <Link href="/friends" className={m.menuLink}>
            <ArrowLeft /> Friends &amp; meetups
          </Link>
          {alert && <p className={m.menuNote}>{alert}</p>}
          {menu}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

/** Dark ink pill: "● Tracking live · paani is 6 min away · 5s ago". */
export function StatusPill({ label, detail, ago, live = true }) {
  return (
    <div className={m.status} role="status" aria-live="polite">
      <span className={`${m.liveDot} ${live ? '' : m.idleDot}`} aria-hidden="true" />
      <span className={m.statusText}>
        <strong>{label}</strong>
        {detail && <span className={m.statusDetail}> · {detail}</span>}
      </span>
      {ago && <span className={m.ago}>{ago}</span>}
    </div>
  );
}

/** Right-edge map controls: fit everyone, navigate / exit, and "See friend" while navigating. */
export function MapControls({ onFit, onNavigate, navigating, onExitNav, pill }) {
  return (
    <div className={m.controls}>
      <div className={m.ctrlCol}>
        {navigating ? (
          <button type="button" className={m.ctrlBtn} onClick={onExitNav} aria-label="Exit navigation" title="Exit navigation">
            <CloseIcon />
          </button>
        ) : (
          <button type="button" className={m.ctrlBtn} onClick={onFit} aria-label="Show everyone" title="Show everyone">
            <FitIcon />
          </button>
        )}
        {onNavigate && !navigating && (
          <button
            type="button"
            className={`${m.ctrlBtn} ${m.ctrlEmber}`}
            onClick={onNavigate}
            aria-label="Navigate"
            title="Navigate"
          >
            <NavIcon />
          </button>
        )}
      </div>
      {pill}
    </div>
  );
}

/** "Meeting at <place>" with Navigate and whose-route switch. */
export function DestCard({ name, navigating, onNavigate, onExit, viewing, onPov, friendName, friendKnown }) {
  return (
    <section>
      <div className={m.spotRow}>
        <span className={m.spotIcon} aria-hidden="true">
          <PinIcon />
        </span>
        <span className={m.spotText}>
          <span className={m.kicker}>Meeting at</span>
          <span className={m.spotName}>{name}</span>
        </span>
        {navigating ? (
          <button type="button" className={`${m.btnGhost} ${m.btnSm}`} onClick={onExit}>
            Exit
          </button>
        ) : (
          <button type="button" className={`${m.btn} ${m.btnSm}`} onClick={onNavigate}>
            Navigate
          </button>
        )}
      </div>
      <div className={m.seg} role="tablist" aria-label="Whose route to follow">
        <button
          type="button"
          role="tab"
          aria-selected={viewing === 'me'}
          className={viewing === 'me' ? m.segOn : m.segBtn}
          onClick={() => onPov('me')}
        >
          My route
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={viewing === 'friend'}
          className={viewing === 'friend' ? m.segOn : m.segBtn}
          onClick={() => onPov('friend')}
          disabled={!friendKnown}
        >
          {friendName}&apos;s location
        </button>
      </div>
    </section>
  );
}

/** You + friend rows: ETA, distance left, freshness. */
export function PeopleList({ rows }) {
  return (
    <ul className={m.people}>
      {rows.map((r) => (
        <li key={r.key} className={m.person}>
          <span className={r.me ? m.avatarMe : m.avatarFriend} aria-hidden="true">
            {r.letter}
          </span>
          <span className={m.personMain}>
            <span className={m.personName} style={{ display: 'block' }}>{r.name}</span>
            <span className={m.personSub} style={{ display: 'block' }}>
              {r.arrived ? <span className={m.arrived}>Arrived</span> : r.sub}
            </span>
          </span>
          {r.km != null && <span className={m.personValue}>{fmtKm(r.km)}</span>}
        </li>
      ))}
    </ul>
  );
}

/** "Fair halfway point" row with a quick Suggest. */
export function HalfwayRow({ name, busy, onSuggest }) {
  return (
    <section>
      <div className={m.spotRow}>
        <span className={m.spotIcon} aria-hidden="true">
          <FitIcon />
        </span>
        <span className={m.spotText}>
          <span className={m.kicker}>Fair halfway point</span>
          <span className={m.spotName}>{name}</span>
        </span>
        <button type="button" className={`${m.btnGhost} ${m.btnSm}`} disabled={busy} onClick={onSuggest}>
          Suggest
        </button>
      </div>
      <p className={m.hint} style={{ marginTop: 6 }}>
        Or pick a place below, or tap anywhere on the map to drop a pin.
      </p>
    </section>
  );
}

/** Text for the ink status pill, from the real meetup state. */
export function meetStatusPill({ status, friendName, friendLoc, friendArrived, friendEta, friendDistKm, friendNav, friendAgo }) {
  if (status === 'live') {
    return {
      label: 'Tracking live',
      detail: friendArrived
        ? `${friendName} has arrived`
        : !friendLoc
          ? `waiting for ${friendName}`
          : friendEta != null
            ? `${friendName} is ${fmtMin(friendEta)} away`
            : friendDistKm != null
              ? `${friendName} is ${fmtKm(friendNav?.progress?.remainingKm ?? friendDistKm)} away`
              : `${friendName} is on the way`,
      ago: friendAgo,
    };
  }
  return {
    label: 'Picking a place',
    detail: friendLoc ? `with ${friendName}` : `waiting for ${friendName}'s location`,
    ago: friendAgo,
    live: !!friendLoc,
  };
}

/**
 * ETA bubbles above each person: road ETA while live; while planning, a rough
 * time to the halfway point (straight line, ~25 km/h).
 */
export function etaTags({ status, myPos, friendLoc, center, iArrived, friendArrived, myEtaMin, friendEta }) {
  const rough = (p) => (p && center ? `~${fmtMin(approxMinutes(haversine([p.lat, p.lng], center)))}` : null);
  if (status === 'live') {
    return {
      meTag: iArrived ? 'Arrived' : myEtaMin != null ? fmtMin(myEtaMin) : null,
      friendTag: friendArrived ? 'Arrived' : friendEta != null ? fmtMin(friendEta) : null,
    };
  }
  return { meTag: rough(myPos), friendTag: rough(friendLoc) };
}
