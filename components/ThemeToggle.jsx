'use client';

import { useCallback, useEffect, useState } from 'react';
import styles from './ThemeToggle.module.css';

export default function ThemeToggle() {
  const [mode, setMode] = useState('system');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('halfway-theme');
    if (saved === 'dark' || saved === 'light') {
      document.documentElement.setAttribute('data-mode', saved);
      setMode(saved);
    }
    setMounted(true);
  }, []);

  const cycle = useCallback(() => {
    setMode((cur) => {
      const next = cur === 'light' ? 'dark' : cur === 'dark' ? 'system' : 'light';
      if (next === 'system') {
        document.documentElement.removeAttribute('data-mode');
        localStorage.removeItem('halfway-theme');
      } else {
        document.documentElement.setAttribute('data-mode', next);
        localStorage.setItem('halfway-theme', next);
      }
      return next;
    });
  }, []);

  const label = mode === 'dark' ? '☽' : mode === 'light' ? '☀' : '◐';
  const title = mode === 'dark' ? 'Dark mode' : mode === 'light' ? 'Light mode' : 'System theme';

  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={cycle}
      aria-label={title}
      title={title}
      suppressHydrationWarning
    >
      {mounted ? label : '◐'}
    </button>
  );
}
