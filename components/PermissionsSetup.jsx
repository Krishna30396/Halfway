'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { enablePush, pushSupported, nativePushPermission, nativePushRegistered } from '@/lib/push';
import { isNativeApp, getAlertSettings, getBackgroundGeolocation } from '@/lib/native';
import s from './PermissionsSetup.module.css';

const DONE_KEY = 'halfway-perms-v1';
const SNOOZE_KEY = 'halfway-perms-snooze';
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;
export const OPEN_PERMISSIONS_EVENT = 'halfway:open-permissions';

const read = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    // private mode — the screen may show again next time
  }
};

async function notificationStatus() {
  if (isNativeApp()) {
    const p = await nativePushPermission().catch(() => 'prompt');
    if (p === 'denied') return 'blocked';
    return p === 'granted' && nativePushRegistered() ? 'on' : 'off';
  }
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  if (Notification.permission !== 'granted') return 'off';
  const reg = await navigator.serviceWorker.getRegistration().catch(() => null);
  return (await reg?.pushManager.getSubscription().catch(() => null)) ? 'on' : 'off';
}

async function locationStatus() {
  try {
    const p = await navigator.permissions.query({ name: 'geolocation' });
    return p.state === 'granted' ? 'on' : p.state === 'denied' ? 'blocked' : 'off';
  } catch {
    return 'off';
  }
}

async function alertStatus() {
  const plugin = await getAlertSettings().catch(() => null);
  if (!plugin) return { state: 'manual' };
  const st = await plugin.status().catch(() => null);
  if (!st) return { state: 'manual' };
  return { state: st.enabled !== false && st.popUp !== false && st.lockScreen !== false ? 'on' : 'off', plugin };
}

async function openAppSettings() {
  const bg = await getBackgroundGeolocation().catch(() => null);
  await bg?.openSettings?.().catch(() => {});
}

/**
 * One screen that asks for everything Halfway needs, with a clear Allow /
 * Not now per item and its live status. Shown once after sign-in (and again
 * if notifications end up off), or from Friends → App permissions.
 */
export default function PermissionsSetup() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [native, setNative] = useState(false);
  const [status, setStatus] = useState({});
  const [skipped, setSkipped] = useState({});
  const [busy, setBusy] = useState(null);
  const [notes, setNotes] = useState({});

  const refresh = useCallback(async () => {
    const [notifications, location, alerts] = await Promise.all([
      notificationStatus(),
      locationStatus(),
      isNativeApp() ? alertStatus() : Promise.resolve(null),
    ]);
    setStatus((cur) => ({ ...cur, notifications, location, alerts: alerts?.state, alertPlugin: alerts?.plugin }));
    return { notifications };
  }, []);

  // Decide whether to show it on its own.
  useEffect(() => {
    if (!user || pathname?.startsWith('/auth')) return;
    setNative(isNativeApp());
    let alive = true;
    refresh().then(({ notifications }) => {
      if (!alive) return;
      const snoozed = Date.now() - parseInt(read(SNOOZE_KEY) || '0', 10) < SNOOZE_MS;
      const firstTime = read(DONE_KEY) !== 'done';
      const needsNotifications = notifications === 'off' || notifications === 'blocked';
      if ((firstTime || needsNotifications) && !snoozed) setOpen(true);
    });
    return () => {
      alive = false;
    };
  }, [user, pathname, refresh]);

  // Opened on purpose (Friends → App permissions), and re-checked whenever the
  // person comes back from Android settings.
  useEffect(() => {
    const show = () => {
      setNative(isNativeApp());
      refresh();
      setOpen(true);
    };
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    window.addEventListener(OPEN_PERMISSIONS_EVENT, show);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener(OPEN_PERMISSIONS_EVENT, show);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  if (!open || !user) return null;

  const allow = (key, fn) => async () => {
    setBusy(key);
    setNotes((n) => ({ ...n, [key]: null }));
    setSkipped((sk) => ({ ...sk, [key]: false }));
    try {
      const note = await fn();
      if (note) setNotes((n) => ({ ...n, [key]: note }));
    } catch (err) {
      setNotes((n) => ({ ...n, [key]: err.message || 'That didn’t work — try again.' }));
    } finally {
      await refresh();
      setBusy(null);
    }
  };
  const skip = (key) => () => setSkipped((sk) => ({ ...sk, [key]: true }));

  const items = [
    {
      key: 'notifications',
      title: 'Notifications',
      why: 'Hear about friend requests, meetup invites, suggested places and arrivals — even when Halfway is closed.',
      state: status.notifications,
      run: async () => {
        await enablePush(user.id);
      },
      blockedHelp: native
        ? 'Notifications are blocked. Tap Open settings → Notifications → turn them on.'
        : 'Notifications are blocked in this browser. Allow them in the site settings, then come back.',
    },
    {
      key: 'location',
      title: 'Location (precise)',
      why: 'Finds the fair halfway point and lets your friend see you while you travel to meet. Only shared during a meetup you accept.',
      state: status.location,
      run: () =>
        new Promise((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(
            (pos) =>
              resolve(
                pos.coords.accuracy > 200
                  ? `Only approximate (±${Math.round(pos.coords.accuracy)} m). Turn on “Use precise location” for Halfway in settings.`
                  : null
              ),
            (err) => reject(new Error(err.code === 1 ? 'Location was not allowed.' : 'Couldn’t get a GPS fix — try outdoors.')),
            { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
          )
        ),
      blockedHelp: native
        ? 'Location is blocked. Tap Open settings → Permissions → Location → Allow, and turn on Use precise location.'
        : 'Location is blocked in this browser. Allow it in the site settings, then come back.',
    },
  ];
  if (native) {
    items.push(
      {
        key: 'alerts',
        title: 'Pop-up & lock-screen alerts',
        why: 'Makes meetup alerts pop up over other apps and show on the lock screen, like a message.',
        state: status.alerts === 'manual' ? 'unknown' : status.alerts,
        run: async () => {
          if (status.alertPlugin) await status.alertPlugin.open();
          else await openAppSettings();
          return 'In Notifications → Meetup alerts, turn on Pop on screen and Lock screen, then come back.';
        },
      },
      {
        key: 'background',
        title: 'Run in the background',
        why: 'Phones like Xiaomi, Redmi, Realme, Oppo and Vivo stop apps in the background, so alerts arrive late or not at all.',
        state: 'unknown',
        run: async () => {
          await openAppSettings();
          return 'Turn on Autostart, and set Battery saver to No restrictions for Halfway, then come back.';
        },
      }
    );
  }

  const label = (it) => {
    if (it.state === 'on') return { text: 'Allowed', cls: s.on };
    if (it.state === 'blocked') return { text: 'Blocked', cls: s.blocked };
    if (skipped[it.key]) return { text: 'Not now', cls: s.skipped };
    if (it.state === 'unsupported') return { text: 'Not available here', cls: s.skipped };
    if (it.state === 'unknown') return { text: 'Check once', cls: s.off };
    return { text: 'Not allowed', cls: s.off };
  };

  const close = () => {
    write(DONE_KEY, 'done');
    if (status.notifications !== 'on') write(SNOOZE_KEY, String(Date.now()));
    setOpen(false);
  };

  return (
    <div className={s.scrim} role="presentation">
      <div className={s.sheet} role="dialog" aria-modal="true" aria-labelledby="perm-title">
        <h2 id="perm-title" className={s.title}>
          Set up Halfway
        </h2>
        <p className={s.lead}>Allow what you’re comfortable with — you can change any of this later in Friends.</p>
        <ul className={s.list}>
          {items.map((it) => {
            const l = label(it);
            return (
              <li key={it.key} className={s.item}>
                <div className={s.head}>
                  <strong>{it.title}</strong>
                  <span className={`${s.chip} ${l.cls}`}>{l.text}</span>
                </div>
                <p className={s.why}>{it.state === 'blocked' && it.blockedHelp ? it.blockedHelp : it.why}</p>
                {notes[it.key] && <p className={s.note}>{notes[it.key]}</p>}
                {it.state !== 'on' && it.state !== 'unsupported' && !(it.state === 'blocked' && !native) && (
                  <div className={s.actions}>
                    {it.state === 'blocked' ? (
                      <button type="button" className={s.yes} onClick={allow(it.key, openAppSettings)}>
                        Open settings
                      </button>
                    ) : (
                      <button type="button" className={s.yes} onClick={allow(it.key, it.run)} disabled={busy === it.key}>
                        {busy === it.key ? '…' : 'Allow'}
                      </button>
                    )}
                    {!skipped[it.key] && (
                      <button type="button" className={s.no} onClick={skip(it.key)}>
                        Not now
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <button type="button" className={s.done} onClick={close}>
          Done
        </button>
      </div>
    </div>
  );
}
