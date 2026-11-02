// Service worker de Carlos P. Nauto Interactive.
// Permite instalar la app y usarla sin conexión: guarda las pantallas principales y sus
// archivos, así la app abre sin internet (la biblioteca y las canciones descargadas).
const CACHE = 'cpn-cache-v133'
const OFFLINE_URLS = ['/', '/music', '/music/library', '/radio', '/tv', '/peliculas', '/cine', '/novedades']

// Guarda una página y los archivos de la app que usa (scripts y estilos), para que abra sin internet
async function cachePage(cache, url) {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return
    await cache.put(url, res.clone())
    const html = await res.text()
    const assets = Array.from(html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g), (m) => m[1])
    await Promise.all(
      Array.from(new Set(assets)).map((a) =>
        cache.match(a).then((hit) => hit || fetch(a).then((r) => r.ok && cache.put(a, r)).catch(() => {}))
      )
    )
  } catch {}
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => Promise.all(OFFLINE_URLS.map((u) => cachePage(cache, u)))))
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
  // Solo nuestro origen; las APIs y los audios siempre van a la red.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  // Archivos estáticos con hash: primero caché.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || (url.pathname.startsWith('/brand/') && !url.pathname.endsWith('.mp4'))) {
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

  // Páginas: primero red (si tarda mucho, lo guardado); sin conexión, lo guardado o la biblioteca
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE)
        const network = fetch(request).then((res) => {
          if (res.ok) cache.put(request, res.clone())
          return res
        })
        const slow = new Promise((resolve) => setTimeout(resolve, 6000, null))
        try {
          const res = await Promise.race([network, slow])
          if (res) return res
        } catch {}
        const cached =
          (await cache.match(request, { ignoreSearch: true })) ||
          (await cache.match('/music/library')) ||
          (await cache.match('/'))
        return cached || network
      })()
    )
  }
})
