/* Service worker: network-first (sempre busca a versão atual quando online;
 * usa cache só como fallback offline). Evita servir assets desatualizados. */
const CACHE = 'sintegrabrasil-v2';
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
  // Nunca cachear API nem páginas dinâmicas de consulta.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/cnpj/')) return;

  // network-first: tenta a rede; em sucesso atualiza o cache; offline -> cache.
  e.respondWith(
    fetch(req)
      .then((resp) => {
        if (resp && resp.status === 200 && url.origin === self.location.origin) {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return resp;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('/')))
  );
});
