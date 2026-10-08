'use client';

import { useEffect, useState } from 'react';
import styles from './ThemeToggle.module.css';

const KEY = 'halfway-theme';

function currentMode() {
  const attr = document.documentElement.getAttribute('data-mode');
  if (attr === 'dark' || attr === 'light') return attr;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const Moon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
  </svg>
);

const Sun = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
  </svg>
);

// Several toggles can be on screen at once (sidebar + mobile sheet), so the
// <html> attribute is the single source of truth and every toggle watches it.
export default function ThemeToggle({ className }) {
  const [mode, setMode] = useState(null);

  useEffect(() => {
    setMode(currentMode());
    const observer = new MutationObserver(() => setMode(currentMode()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-mode'] });
    return () => observer.disconnect();
  }, []);

  const toggle = () => {
    const next = currentMode() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-mode', next);
    try {
      localStorage.setItem(KEY, next);
    } catch {}
  };

  const isDark = mode === 'dark';
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <button
      type="button"
      className={`${styles.toggle} hw-press ${className || ''}`}
      onClick={toggle}
      aria-label={label}
      title={label}
      suppressHydrationWarning
    >
      <span key={mode || 'none'} className={styles.icon}>
        {isDark ? <Sun /> : <Moon />}
      </span>
    </button>
  );
}
