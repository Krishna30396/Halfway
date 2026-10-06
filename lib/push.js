import { getSupabase } from './supabase';

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function pushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

// The service worker only registers in production builds, so `ready` would
// hang forever in dev — time out with an explanation instead.
function swReady(ms = 6000) {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error('Notifications only work in the deployed app, not in dev mode.')),
        ms
      )
    ),
  ]);
}

/** Ask permission (if needed), subscribe this device, and store it for the user. */
export async function enablePush(userId) {
  if (!pushSupported()) {
    throw new Error(
      "This browser can't receive notifications. On iPhone, add Halfway to your Home Screen first."
    );
  }
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) throw new Error('Notifications are not configured yet (missing VAPID key).');

  const permission =
    Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notifications are blocked. Allow them for Halfway in your browser settings.');
  }

  const reg = await swReady();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
    } catch (err) {
      if (navigator.brave) {
        throw new Error(
          'Brave blocks notifications by default. Open brave://settings/privacy, turn on "Use Google services for push messaging", restart Brave and try again.'
        );
      }
      throw new Error(
        `This browser's notification service refused (${err.message}). Try Chrome, or the app installed from your home screen.`
      );
    }
  }

  const json = sub.toJSON();
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', json.endpoint);
  const { error } = await supabase.from('push_subscriptions').insert({
    user_id: userId,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
  });
  // 23505: this device is still registered to a different account.
  if (error && error.code !== '23505') throw error;
}
