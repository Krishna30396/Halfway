import { getSupabase } from './supabase';
import { isNativeApp, getPushNotifications } from './native';

export const NATIVE_BLOCKED_MESSAGE =
  'Notifications are blocked for Halfway. Open Android Settings → Apps → Halfway → Notifications, turn them on, then come back.';

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function pushSupported() {
  if (isNativeApp()) return true;
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

// 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied'
export async function nativePushPermission() {
  const PushNotifications = await getPushNotifications();
  const { receive } = await PushNotifications.checkPermissions();
  return receive;
}

let nativeTokenSaved = false;
let nativePending = null;

export function nativePushRegistered() {
  return nativeTokenSaved;
}

function waitForToken(PushNotifications) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let handles = [];
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      handles.forEach((h) => h.remove());
      fn(value);
    };
    const timer = setTimeout(
      () => finish(reject, new Error("Couldn't reach the notification service. Check your connection and try again.")),
      20000
    );
    Promise.all([
      PushNotifications.addListener('registration', (t) => finish(resolve, t.value)),
      PushNotifications.addListener('registrationError', (e) =>
        finish(
          reject,
          new Error(
            /SERVICE_NOT_AVAILABLE|TIMEOUT/.test(e?.error || '')
              ? "Google Play services on this phone isn't answering, so alerts can't be set up. Restart the phone, open Halfway again, and it will retry."
              : `Couldn't register this phone for notifications${e?.error ? ` (${e.error})` : ''}.`
          )
        )
      ),
    ])
      .then((hs) => {
        handles = hs;
        if (settled) hs.forEach((h) => h.remove());
        return PushNotifications.register();
      })
      .catch((err) => finish(reject, err));
  });
}

async function enableNativePush(userId) {
  const PushNotifications = await getPushNotifications();
  // No `sound` here: the plugin treats it as a res/raw file name, and leaving it
  // out gives a high-importance channel the system default sound.
  await PushNotifications.createChannel({
    id: 'halfway_alerts',
    name: 'Meetup alerts',
    description: 'Meetup requests, suggested places and arrivals',
    importance: 5,
    visibility: 1,
    vibration: true,
    lights: true,
  });

  let { receive } = await PushNotifications.checkPermissions();
  if (receive === 'prompt' || receive === 'prompt-with-rationale') {
    ({ receive } = await PushNotifications.requestPermissions());
  }
  if (receive !== 'granted') throw new Error(NATIVE_BLOCKED_MESSAGE);

  const token = await waitForToken(PushNotifications);
  // Same token for the same account as last time: it's already saved, skip
  // the database writes (they ran on every page load before).
  const savedKey = `${userId}|${token}`;
  try {
    if (localStorage.getItem('halfway-fcm') === savedKey) {
      nativeTokenSaved = true;
      return;
    }
  } catch {
    // no storage — save again
  }
  const supabase = getSupabase();
  if (!supabase) return;
  const { error } = await supabase.from('device_tokens').upsert(
    {
      user_id: userId,
      token,
      platform: window.Capacitor?.getPlatform?.() || 'android',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'token' }
  );
  // 42501: this device is still registered to a different account.
  if (error && error.code !== '42501') throw error;
  nativeTokenSaved = true;
  // Alerts now come from the app. Drop this account's browser (Chrome)
  // subscriptions so nothing arrives twice or as "possible spam" from Chrome.
  await supabase.from('push_subscriptions').delete().eq('user_id', userId);
  try {
    localStorage.setItem('halfway-fcm', savedKey);
  } catch {
    // ignore
  }
}

/** Ask permission (if needed), subscribe this device, and store it for the user. */
export async function enablePush(userId) {
  if (isNativeApp()) {
    nativePending ||= enableNativePush(userId).finally(() => {
      nativePending = null;
    });
    return nativePending;
  }
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
        "This browser doesn't support phone notifications for web apps. Open Halfway in Google Chrome (on Android) or Safari after Add to Home Screen (on iPhone), then turn notifications on there."
      );
    }
  }

  const json = sub.toJSON();
  const supabase = getSupabase();
  if (!supabase) return;
  // Already saved for this account from this browser: skip the two writes
  // that used to run on every page load.
  const savedKey = `${userId}|${json.endpoint}`;
  try {
    if (localStorage.getItem('halfway-push-ep') === savedKey) return;
  } catch {
    // no storage — just save again
  }
  await supabase.from('push_subscriptions').delete().eq('endpoint', json.endpoint);
  const { error } = await supabase.from('push_subscriptions').insert({
    user_id: userId,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
  });
  // 23505: this device is still registered to a different account.
  if (error && error.code !== '23505') throw error;
  try {
    localStorage.setItem('halfway-push-ep', savedKey);
  } catch {
    // ignore
  }
}
