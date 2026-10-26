// Service worker de Carlos P. Nauto Interactive.
// Permite instalar la app y abrirla sin conexión con lo último que se visitó.
const CACHE = 'cpn-cache-v11'
const OFFLINE_URLS = ['/', '/music', '/cine', '/music/library', '/radio', '/tv']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(OFFLINE_URLS).catch(() => {}))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  // Solo nuestro origen; las APIs y YouTube siempre van a la red.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  // Archivos estáticos con hash: primero caché.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(request, copy))
            return res
          })
      )
    )
    return
  }

  // Páginas: primero red, y si no hay conexión, lo guardado.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(request, copy))
          return res
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
    )
  }
})
