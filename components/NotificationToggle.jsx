'use client';

import { useEffect, useState } from 'react';
import { useAuth } from './AuthProvider';
import { enablePush, pushSupported } from '@/lib/push';
import s from './Social.module.css';

export default function NotificationToggle() {
  const { user } = useAuth();
  const [state, setState] = useState('checking');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
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
  }, []);

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
      if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
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
