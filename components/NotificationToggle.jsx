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
import { isNativeApp, getAlertSettings } from '@/lib/native';
import { sendTestNotification } from '@/lib/notify';
import s from './Social.module.css';

// Inside the app: are alerts allowed to pop up and show on the lock screen?
function useAlertCheck(active) {
  const [check, setCheck] = useState(null);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    const run = () =>
      getAlertSettings()
        .then((plugin) => plugin && plugin.status().then((st) => alive && setCheck({ plugin, ...st })))
        .catch(() => {});
    run();
    // Re-check when coming back from Android settings.
    const onVisible = () => document.visibilityState === 'visible' && run();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [active]);
  return check;
}

/** Lets you fire a test alert at your own phone, with time to lock the screen first. */
function TestAlert({ alertCheck }) {
  const [phase, setPhase] = useState('idle');
  const [msg, setMsg] = useState(null);
  const run = async () => {
    setPhase('waiting');
    setMsg('Lock your phone now — the alert arrives in about 5 seconds.');
    try {
      const sent = await sendTestNotification(5);
      setPhase('idle');
      setMsg(
        sent
          ? `Sent to ${sent} device${sent > 1 ? 's' : ''}. Did it pop up on your lock screen? If not, check the tips below.`
          : 'No device got it — turn notifications off and on again on this phone.'
      );
    } catch (err) {
      setPhase('idle');
      setMsg(err.message);
    }
  };
  return (
    <div className={s.testAlert}>
      <div className={s.actions}>
        <button type="button" className={`${s.secondary} ${s.small}`} onClick={run} disabled={phase === 'waiting'}>
          {phase === 'waiting' ? 'Sending in 5 s…' : 'Send a test alert'}
        </button>
        {alertCheck?.plugin && (
          <button type="button" className={`${s.secondary} ${s.small}`} onClick={() => alertCheck.plugin.open()}>
            Alert settings
          </button>
        )}
      </div>
      {msg && <p className={s.hint}>{msg}</p>}
      {isNativeApp() && (
        <p className={s.hint}>
          On Xiaomi, Redmi, Poco, Realme, Oppo and Vivo phones also turn on <strong>Floating notifications</strong>,{' '}
          <strong>Lock screen notifications</strong> and <strong>Autostart</strong> for Halfway, and set Battery saver
          to <strong>No restrictions</strong> — those phones hide pop-ups for new apps by default.
        </p>
      )}
    </div>
  );
}

export default function NotificationToggle({ showTest = false }) {
  const { user } = useAuth();
  const [state, setState] = useState('checking');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const userId = user?.id;
  const alertCheck = useAlertCheck(state === 'on');

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
    const blocked =
      alertCheck && (alertCheck.enabled === false || alertCheck.popUp === false || alertCheck.lockScreen === false);
    if (!blocked && !showTest) return <p className={s.ok}>Notifications are on for this device.</p>;
    return (
      <div className={s.card}>
        {blocked ? (
          <div className={s.notify}>
            <div className={s.notifyText}>
              <strong>Alerts won&apos;t pop up</strong>
              {alertCheck.enabled === false
                ? 'Notifications are switched off for Halfway.'
                : alertCheck.popUp === false
                  ? 'Meetup alerts are set to silent, so they won’t show over other apps or wake you.'
                  : 'Meetup alerts are hidden on the lock screen.'}{' '}
              Tap Fix and turn on Pop on screen and Lock screen.
            </div>
            <button type="button" className={`${s.primary} ${s.small}`} onClick={() => alertCheck.plugin.open()}>
              Fix
            </button>
          </div>
        ) : (
          <p className={s.ok}>Notifications are on for this device.</p>
        )}
        {showTest && <TestAlert alertCheck={alertCheck} />}
      </div>
    );
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
