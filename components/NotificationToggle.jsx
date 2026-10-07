'use client';

import { useEffect, useState } from 'react';
import { useAuth } from './AuthProvider';
import {
  enablePush,
  pushSupported,
  nativePushPermission,
  nativePushRegistered,
  NATIVE_BLOCKED_MESSAGE,
} from '@/lib/push';
import { isNativeApp } from '@/lib/native';
import s from './Social.module.css';

export default function NotificationToggle() {
  const { user } = useAuth();
  const [state, setState] = useState('checking');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const userId = user?.id;

  useEffect(() => {
    if (isNativeApp()) {
      if (!userId) return;
      let alive = true;
      const set = (v) => alive && setState(v);
      nativePushPermission()
        .then((p) => {
          if (p === 'denied') return set('denied');
          if (p !== 'granted') return set('off');
          if (nativePushRegistered()) return set('on');
          return enablePush(userId).then(() => set('on'));
        })
        .catch(() => set('off'));
      return () => {
        alive = false;
      };
    }
    if (!pushSupported()) {
      setState('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }
    if (Notification.permission !== 'granted') {
      setState('off');
      return;
    }
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => setState(sub ? 'on' : 'off'))
      .catch(() => setState('off'));
  }, [userId]);

  if (!user || state === 'checking') return null;

  if (state === 'on') {
    return <p className={s.ok}>Notifications are on for this device.</p>;
  }

  const turnOn = async () => {
    setBusy(true);
    setError(null);
    try {
      await enablePush(user.id);
      setState('on');
    } catch (err) {
      setError(err.message);
      if (isNativeApp()) {
        if ((await nativePushPermission().catch(() => null)) === 'denied') {
          setState('denied');
          setError(null);
        }
      } else if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
        setState('denied');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={s.card}>
      <div className={s.notify}>
        <div className={s.notifyText}>
          <strong>Turn on notifications</strong>
          {state === 'unsupported'
            ? "This browser can't receive them. On iPhone, add Halfway to your Home Screen first."
            : state === 'denied' && isNativeApp()
              ? NATIVE_BLOCKED_MESSAGE
              : state === 'denied'
              ? 'Notifications are blocked for this site. Tap the icon left of the address bar → Permissions → Notifications → Allow, then reload.'
              : 'Get alerted when a friend wants to meet, suggests a place, or arrives.'}
        </div>
        {state === 'off' && (
          <button type="button" className={`${s.primary} ${s.small}`} onClick={turnOn} disabled={busy}>
            {busy ? '…' : 'Turn on'}
          </button>
        )}
      </div>
      {error && <p className={s.error} style={{ marginTop: 10 }}>{error}</p>}
    </div>
  );
}
