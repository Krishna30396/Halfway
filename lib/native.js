// Helpers for when the site runs inside the Halfway Android app (Capacitor).
// The native shell injects window.Capacitor, so detection needs no import;
// the plugin modules are only loaded on demand, inside the app.

export function isNativeApp() {
  if (typeof window === 'undefined') return false;
  try {
    return !!window.Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
}

// Capacitor plugin objects answer every property name, `then` included. An
// async function that returns one makes JavaScript treat it as a promise and
// call a native "then" that doesn't exist, so the await never settles (in the
// app this silently broke notifications). Every plugin handed out from an
// async function goes through this.
function notThenable(plugin) {
  return new Proxy(plugin, { get: (target, key) => (key === 'then' ? undefined : target[key]) });
}

export async function getPushNotifications() {
  const { PushNotifications } = await import('@capacitor/push-notifications');
  return notThenable(PushNotifications);
}

// Android throttles WebView network requests after ~5 minutes in the
// background, so live-location uploads go through the native HTTP stack.
export async function nativeUpsert({ accessToken, table, onConflict, row }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const { CapacitorHttp } = await import('@capacitor/core');
  const res = await CapacitorHttp.request({
    method: 'POST',
    url: `${url}/rest/v1/${table}?on_conflict=${onConflict}`,
    headers: {
      apikey: key,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    data: row,
  });
  if (res.status >= 300) throw new Error(`Upload failed (${res.status})`);
}

// Statuses whose Response must have no body.
const NO_BODY = new Set([101, 204, 205, 304]);

/** fetch() over Android's native HTTP stack, returning a normal Response. */
export async function nativeFetch(input, init = {}) {
  const { CapacitorHttp } = await import('@capacitor/core');
  const req = typeof input === 'string' || input instanceof URL ? null : input;
  const url = new URL(req ? req.url : String(input), window.location.href).toString();
  const headers = {};
  new Headers(init.headers || req?.headers || {}).forEach((v, k) => {
    headers[k] = v;
  });
  let data = init.body ?? undefined;
  // The native side serialises `data` itself for JSON requests.
  if (typeof data === 'string' && /json/i.test(headers['content-type'] || '')) {
    try {
      data = JSON.parse(data);
    } catch {}
  }
  const res = await CapacitorHttp.request({
    method: (init.method || req?.method || 'GET').toUpperCase(),
    url,
    headers,
    data,
    responseType: 'text',
  });
  const body = NO_BODY.has(res.status)
    ? null
    : typeof res.data === 'string'
      ? res.data
      : res.data == null
        ? ''
        : JSON.stringify(res.data);
  return new Response(body, { status: res.status, headers: res.headers || {} });
}

/**
 * fetch() that keeps working with the screen off in the Android app: while the
 * app is hidden, requests go through the native stack (the WebView's own are
 * throttled after a few minutes in the background). On screen, plain fetch.
 */
export function backgroundSafeFetch(input, init) {
  const method = (init?.method || 'GET').toUpperCase();
  if (method !== 'HEAD' && isNativeApp() && typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    return nativeFetch(input, init).catch(() => fetch(input, init));
  }
  return fetch(input, init);
}

let backgroundGeolocation = null;
export async function getBackgroundGeolocation() {
  if (!backgroundGeolocation) {
    const { registerPlugin } = await import('@capacitor/core');
    backgroundGeolocation = notThenable(registerPlugin('BackgroundGeolocation'));
  }
  return backgroundGeolocation;
}

// Our own small native plugin (MainActivity.java). Older app builds don't have
// it, so every call is optional.
export async function getAlertSettings() {
  if (!isNativeApp() || !window.Capacitor?.isPluginAvailable?.('AlertSettings')) return null;
  const { registerPlugin } = await import('@capacitor/core');
  return notThenable(registerPlugin('AlertSettings'));
}
