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

export async function getPushNotifications() {
  const { PushNotifications } = await import('@capacitor/push-notifications');
  return PushNotifications;
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

let backgroundGeolocation = null;
export async function getBackgroundGeolocation() {
  if (!backgroundGeolocation) {
    const { registerPlugin } = await import('@capacitor/core');
    backgroundGeolocation = registerPlugin('BackgroundGeolocation');
  }
  return backgroundGeolocation;
}
