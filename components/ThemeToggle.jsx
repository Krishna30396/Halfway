'use client';

import { useEffect, useState } from 'react';
import styles from './ThemeToggle.module.css';

const KEY = 'halfway-theme';

function currentMode() {
  const attr = document.documentElement.getAttribute('data-mode');
  if (attr === 'dark' || attr === 'light') return attr;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// Several toggles can be on screen at once (sidebar + mobile sheet), so the
// <html> attribute is the single source of truth and every toggle watches it.
export default function ThemeToggle() {
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
      className={styles.toggle}
      onClick={toggle}
      aria-label={label}
      title={label}
      suppressHydrationWarning
    >
      {mode ? (isDark ? '☀' : '☽') : '◐'}
    </button>
  );
}
