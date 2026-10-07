'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isNativeApp, getPushNotifications } from '@/lib/native';

export default function ServiceWorkerRegistrar() {
  const router = useRouter();

  // Inside the Android app, notifications are native and a tap opens the app —
  // route to the page the notification is about.
  useEffect(() => {
    if (!isNativeApp()) return;
    let handle;
    let alive = true;
    getPushNotifications()
      .then((PushNotifications) =>
        PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
          const url = notification?.data?.url;
          if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) router.push(url);
        })
      )
      .then((h) => {
        handle = h;
        if (!alive) h.remove();
      })
      .catch(() => {});
    return () => {
      alive = false;
      handle?.remove();
    };
  }, [router]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // The app has native push and loads the live site anyway, so a worker would
    // only add a stale cache layer.
    if (isNativeApp()) {
      navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
      return;
    }

    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
      return;
    }

    // When a newer deploy's worker takes over, reload once so the user isn't
    // left on the old version. Skip on first install (no previous controller).
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    const onControllerChange = () => {
      if (!hadController || reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    let registration;
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        registration = reg;
      })
      .catch(() => {});

    // Check for a new deploy whenever the app comes back to the foreground.
    const onVisible = () =>
      document.visibilityState === 'visible' && registration?.update().catch(() => {});
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return null;
}
