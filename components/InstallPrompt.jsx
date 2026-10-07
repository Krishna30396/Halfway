'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './InstallPrompt.module.css';

// iPhone Safari has no install prompt: people add the site from the Share menu.
function isIosSafari() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|Instagram|FBAN|FBAV/.test(ua);
}

export default function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);
  const deferredRef = useRef(null);

  useEffect(() => {
    const visits = parseInt(localStorage.getItem('halfway-visits') || '0', 10) + 1;
    localStorage.setItem('halfway-visits', String(visits));

    if (localStorage.getItem('halfway-install-dismissed')) return;
    if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) return;
    // On iPhone notifications only work from the Home Screen icon, so ask right away.
    if (isIosSafari()) {
      setIos(true);
      setShow(true);
      return;
    }
    if (visits < 2) return;

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
        {ios ? (
          <span>
            Tap <b>Share</b> <span aria-hidden="true">⬆︎</span> then <b>Add to Home Screen</b>, and open Halfway from
            the new icon — notifications only work there.
          </span>
        ) : (
          <span>Add to your home screen for quick access</span>
        )}
      </div>
      {!ios && (
        <button type="button" className={styles.install} onClick={install}>
          Install
        </button>
      )}
      <button type="button" className={styles.close} onClick={dismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
