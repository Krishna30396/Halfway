'use client';

import Link from 'next/link';
import HalfwayMark from './HalfwayMark';
import { OPEN_FRIENDS_EVENT } from '../FriendsWidget';
import styles from './TabBar.module.css';

const icon = {
  search: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  ),
  explore: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="m15.2 8.8-1.9 4.5-4.5 1.9 1.9-4.5z" />
    </svg>
  ),
  meetups: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="5.5" width="16" height="14" rx="2.5" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </svg>
  ),
  profile: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="8.5" r="3.8" />
      <path d="M4.8 20c.9-3.6 3.7-5.6 7.2-5.6s6.3 2 7.2 5.6" />
    </svg>
  ),
};

function Tab({ id, label, active, onClick, href }) {
  const cls = active ? styles.tabOn : styles.tab;
  const inner = (
    <>
      <span className={styles.icon}>{icon[id]}</span>
      <span className={styles.label}>{label}</span>
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls} aria-current={active ? 'page' : undefined}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} onClick={onClick} aria-current={active ? 'page' : undefined}>
      {inner}
    </button>
  );
}

/** Phone tab bar for the home screen. Hidden on desktop (the sidebar does the job). */
export default function TabBar({ active = 'search', onSearch, onExplore }) {
  return (
    <nav className={styles.bar} aria-label="Main">
      <Tab id="search" label="Search" active={active === 'search'} onClick={onSearch} />
      <Tab id="explore" label="Explore" active={active === 'explore'} onClick={onExplore} />
      <div className={styles.centreSlot}>
        <button
          type="button"
          className={styles.centre}
          aria-label="Friends and meetups"
          onClick={() => window.dispatchEvent(new Event(OPEN_FRIENDS_EVENT))}
        >
          <HalfwayMark size={26} />
        </button>
      </div>
      <Tab id="meetups" label="Meetups" href="/friends#meetups" />
      <Tab id="profile" label="Profile" href="/friends" />
    </nav>
  );
}
