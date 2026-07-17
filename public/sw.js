const PRECACHE_NAME = 'cmsports-precache-v3';
const STATIC_CACHE_NAME = 'cmsports-static-v3';
const APP_SHELL = ['/manifest.json', '/logo.png', '/icon-192.png', '/icon-512.png'];

async function clearPrivateCaches() {
  const keys = await caches.keys();
  await Promise.all(keys.filter((key) => key !== PRECACHE_NAME).map((key) => caches.delete(key)));
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(PRECACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== PRECACHE_NAME && key !== STATIC_CACHE_NAME)
        .map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'CLEAR_PRIVATE_DATA') event.waitUntil(clearPrivateCaches());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.pathname.endsWith('/auth/v1/logout')) {
    event.waitUntil(clearPrivateCaches());
    return;
  }
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Las páginas pueden contener datos del usuario o del club: nunca se guardan.
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request, { cache: 'no-store' }).catch(() => new Response('Sin conexión. Intenta de nuevo.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      }))
    );
    return;
  }

  const isPrecached = APP_SHELL.includes(url.pathname);
  const isImmutableNextAsset = url.pathname.startsWith('/_next/static/');
  if (!isPrecached && !isImmutableNextAsset) return;

  event.respondWith(
    caches.match(request).then(async (cached) => {
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        const cache = await caches.open(isPrecached ? PRECACHE_NAME : STATIC_CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    })
  );
});
