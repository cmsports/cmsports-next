const PRECACHE_NAME = 'cmsports-precache-v4';
const APP_SHELL = ['/manifest.json', '/logo.png', '/icon-192.png', '/icon-512.png'];

async function clearAllCaches() {
  const keys = await caches.keys();
  await Promise.all(keys.map((key) => caches.delete(key)));
}

async function clearPrivateCaches() {
  const keys = await caches.keys();
  await Promise.all(keys.filter((key) => key !== PRECACHE_NAME).map((key) => caches.delete(key)));
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(PRECACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Al activar una nueva versión del SW, limpiar todos los caches viejos
  // (incluyendo 'cmsports-static-v3' que cacheaba JS bundles de Next.js)
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== PRECACHE_NAME)
        .map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'CLEAR_PRIVATE_DATA') event.waitUntil(clearPrivateCaches());
  if (event.data?.type === 'CLEAR_ALL') event.waitUntil(clearAllCaches());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.pathname.endsWith('/auth/v1/logout')) {
    event.waitUntil(clearPrivateCaches());
    return;
  }
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Páginas: nunca desde caché, siempre red
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request, { cache: 'no-store' }).catch(() => new Response('Sin conexión. Intenta de nuevo.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      }))
    );
    return;
  }

  // /_next/static/ ya tiene hash en el nombre → el browser los cachea por headers HTTP.
  // No los duplicamos en el SW para evitar que chunks viejos queden atrapados.
  if (url.pathname.startsWith('/_next/static/')) return;

  // Solo cachear el app shell (íconos, manifest)
  const isPrecached = APP_SHELL.includes(url.pathname);
  if (!isPrecached) return;

  event.respondWith(
    caches.match(request).then(async (cached) => {
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        const cache = await caches.open(PRECACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    })
  );
});
