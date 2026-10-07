'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { enablePush, pushSupported, nativePushPermission, nativePushRegistered } from '@/lib/push';
import { isNativeApp } from '@/lib/native';
import s from './NotificationPrompt.module.css';

const DISMISS_KEY = 'halfway-notify-dismissed';
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

function snoozed() {
  try {
    const t = parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10);
    return Date.now() - t < SNOOZE_MS;
  } catch {
    return false;
  }
}

// Browsers only show their permission dialog after a tap, so this popup is the
// one-tap path to it. If permission was already granted, nothing is shown.
export default function NotificationPrompt() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user || pathname?.startsWith('/auth')) return;
    if (isNativeApp()) {
      if (snoozed()) return;
      let t;
      let alive = true;
      nativePushPermission()
        .then((p) => {
          if (!alive) return;
          if (p === 'prompt' || p === 'prompt-with-rationale') {
            t = setTimeout(() => setOpen(true), 1500);
          } else if (p === 'granted' && !nativePushRegistered()) {
            enablePush(user.id).catch(() => {});
          }
        })
        .catch(() => {});
      return () => {
        alive = false;
        clearTimeout(t);
      };
    }
    if (!pushSupported() || Notification.permission !== 'default' || snoozed()) return;
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return;
    const t = setTimeout(() => setOpen(true), 1500);
    return () => clearTimeout(t);
  }, [user, pathname]);

  if (!open) return null;

  const turnOn = async () => {
    setBusy(true);
    setError(null);
    try {
      await enablePush(user.id);
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const later = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
    setOpen(false);
  };

  return (
    <div className={s.scrim} role="presentation">
      <div className={s.card} role="dialog" aria-modal="true" aria-labelledby="notify-title">
        <div className={s.bell} aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </div>
        <h2 id="notify-title" className={s.title}>Turn on notifications</h2>
        <p className={s.text}>
          Know straight away when a friend wants to meet, suggests a place, or arrives — even when
          Halfway is closed.
        </p>
        {error && <p className={s.error}>{error}</p>}
        <button type="button" className={s.primary} onClick={turnOn} disabled={busy}>
          {busy ? 'Turning on…' : 'Turn on'}
        </button>
        <button type="button" className={s.secondary} onClick={later}>
          Not now
        </button>
      </div>
    </div>
  );
}
