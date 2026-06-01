/* ══════════════════════════════════════════════════
   Captus — Service Worker v1.1
   Estrategia: Cache-first para el shell de la app,
   Network-first para llamadas a Supabase/APIs.
   Offline: sirve offline.html cuando no hay red.
   ══════════════════════════════════════════════════ */

const CACHE_NAME = 'captus-shell-v1.1';

// Archivos del shell que se cachean al instalar
const SHELL_FILES = [
  '/index.html',
  '/offline.html',
  '/captus-app.js',
  '/supabase.min.js',
  '/icon-192.png',
  '/icon-512.png',
  '/manifest.json'
];

// ── INSTALL: precachear el shell ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(SHELL_FILES);
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: limpiar caches viejos ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: estrategia según tipo de request ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Supabase y otras APIs → siempre red, nunca cachear
  // Si falla, dejar que el error llegue a la app (no servir offline.html)
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('supabase.io') ||
    url.pathname.includes('/rest/') ||
    url.pathname.includes('/auth/') ||
    url.pathname.includes('/storage/')
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Google Fonts → red con fallback a cache
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('cdn.jsdelivr.net')
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        fetch(event.request)
          .then(response => { cache.put(event.request, response.clone()); return response; })
          .catch(() => cache.match(event.request))
      )
    );
    return;
  }

  // Shell de la app → cache-first, con red como fallback
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        // Cachear respuestas válidas del mismo origen
        if (
          response.ok &&
          event.request.method === 'GET' &&
          url.origin === self.location.origin
        ) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => {
        // Sin red: servir offline.html para navegaciones
        if (event.request.mode === 'navigate') {
          return caches.match('/offline.html');
        }
        // Para otros recursos (imágenes, scripts), fallar silenciosamente
      });
    })
  );
});

// ── MESSAGE: permite forzar actualización desde la app ──
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
