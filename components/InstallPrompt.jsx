'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './InstallPrompt.module.css';

export default function InstallPrompt() {
  const [show, setShow] = useState(false);
  const deferredRef = useRef(null);

  useEffect(() => {
    const visits = parseInt(localStorage.getItem('halfway-visits') || '0', 10) + 1;
    localStorage.setItem('halfway-visits', String(visits));

    if (visits < 2) return;
    if (localStorage.getItem('halfway-install-dismissed')) return;
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const handler = (e) => {
      e.preventDefault();
      deferredRef.current = e;
      setShow(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = useCallback(async () => {
    const prompt = deferredRef.current;
    if (!prompt) return;
    prompt.prompt();
    await prompt.userChoice;
    setShow(false);
    deferredRef.current = null;
  }, []);

  const dismiss = useCallback(() => {
    setShow(false);
    localStorage.setItem('halfway-install-dismissed', '1');
  }, []);

  if (!show) return null;

  return (
    <div className={styles.banner} role="alert">
      <div className={styles.text}>
        <strong>Install Halfway</strong>
        <span>Add to your home screen for quick access</span>
      </div>
      <button type="button" className={styles.install} onClick={install}>
        Install
      </button>
      <button type="button" className={styles.close} onClick={dismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
