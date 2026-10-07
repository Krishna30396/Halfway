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

let backgroundGeolocation = null;
export async function getBackgroundGeolocation() {
  if (!backgroundGeolocation) {
    const { registerPlugin } = await import('@capacitor/core');
    backgroundGeolocation = registerPlugin('BackgroundGeolocation');
  }
  return backgroundGeolocation;
}
