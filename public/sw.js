const CACHE_NAME = 'halfway-v2';
const SHELL_ASSETS = ['/manifest.json', '/favicon.svg', '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

function putInCache(request, res) {
  if (res.ok) {
    const clone = res.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
  }
  return res;
}

function networkFirst(request, fallbackUrl) {
  return fetch(request)
    .then((res) => putInCache(request, res))
    .catch(() =>
      caches.match(request).then((hit) => hit || (fallbackUrl ? caches.match(fallbackUrl) : undefined))
    );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Map tiles: cache-first (they rarely change).
  if (
    url.hostname.includes('tile.openstreetmap.org') ||
    url.hostname.includes('stadiamaps.com') ||
    url.hostname.includes('basemaps.cartocdn.com')
  ) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => putInCache(request, res)))
    );
    return;
  }

  // Never cache other origins (Supabase data, auth, images) — always live.
  if (url.origin !== self.location.origin) return;

  // Pages and our API: network-first so new deploys and fresh data win.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, '/'));
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Hashed build assets never change: cache-first.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => putInCache(request, res)))
    );
  }
});

// ---- Push notifications -----------------------------------------------------

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Halfway', body: event.data ? event.data.text() : '' };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Halfway', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-maskable-192.png',
      tag: data.tag,
      renotify: !!data.tag,
      requireInteraction: !!data.requireInteraction,
      vibrate: [200, 100, 200],
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        await client.focus();
        if ('navigate' in client) {
          try {
            await client.navigate(target);
            return;
          } catch {
            // Uncontrolled client — fall through to opening a new window.
          }
        } else {
          return;
        }
      }
      await self.clients.openWindow(target);
    })()
  );
});
