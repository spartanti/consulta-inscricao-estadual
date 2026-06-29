/* Service worker básico: cache de assets estáticos + network-first para HTML. */
const CACHE = 'sintegrabrasil-v1';
const ASSETS = ['/', '/style.css', '/app.js', '/favicon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Nunca cachear a API nem páginas dinâmicas de consulta.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/cnpj/')) return;

  const accept = req.headers.get('accept') || '';
  if (accept.includes('text/html')) {
    // network-first p/ HTML
    e.respondWith(fetch(req).catch(() => caches.match(req).then((r) => r || caches.match('/'))));
  } else {
    // cache-first p/ assets
    e.respondWith(caches.match(req).then((r) => r || fetch(req)));
  }
});
