// Service worker de Carlos P. Nauto Interactive.
// Permite instalar la app y usarla sin conexión: guarda las pantallas principales y sus
// archivos, así la app abre sin internet (la biblioteca y las canciones descargadas).
const CACHE = 'cpn-cache-v203'
// Carátulas: caché aparte que NO se borra con las actualizaciones (se ven sin internet)
const IMG_CACHE = 'cpn-img-v1'
const IMG_MAX = 2000
let imgPuts = 0

async function trimImages(cache) {
  const keys = await cache.keys()
  if (keys.length > IMG_MAX) await Promise.all(keys.slice(0, keys.length - IMG_MAX).map((k) => cache.delete(k)))
}

// Una carátula: primero lo guardado; si no, de internet (directo o por el servidor de la app,
// para que quede guardada aunque el sitio no lo permita) y se guarda
async function imageResponse(request, url) {
  const cache = await caches.open(IMG_CACHE)
  const key = url.href
  const hit = await cache.match(key)
  if (hit) return hit
  let res = null
  try {
    if (url.origin === self.location.origin) res = await fetch(request)
    else {
      res = await fetch(key, { mode: 'cors', credentials: 'omit' }).catch(() => null)
      if (!res || !res.ok) res = await fetch(`/api/img?u=${encodeURIComponent(key)}`).catch(() => null)
    }
  } catch {}
  if (res && res.ok && res.type !== 'opaque') {
    await cache.put(key, res.clone()).catch(() => {})
    if (++imgPuts % 50 === 0) trimImages(cache)
    return res
  }
  // Último recurso: como siempre (se ve con internet, pero no se puede guardar)
  return fetch(request)
}

const OFFLINE_URLS = ['/', '/music', '/music/library', '/radio', '/tv', '/peliculas', '/cine', '/novedades']

// Partes de la app que se cargan "a pedido" (reproductor, ventanas…): están en el índice de webpack.
// Se guardan todas al instalar: sin conexión no falta ninguna (antes la app podía quedar en negro).
async function cacheRuntimeChunks(cache, html) {
  try {
    const runtime = (html.match(/\/_next\/static\/chunks\/webpack-[a-f0-9]+\.js/) || [])[0]
    if (!runtime) return
    const text = await fetch(runtime).then((r) => (r.ok ? r.text() : ''))
    const m = text.match(/"static\/chunks\/"\+\(\(\{([^}]*)\}\)\[e\]\|\|e\)\+"\."\+\(\{([^}]*)\}\)\[e\]\+"\.js"/)
    if (!m) return
    const obj = (src) => Object.fromEntries(Array.from(src.matchAll(/(\d+):"([^"]+)"/g), (x) => [x[1], x[2]]))
    const names = obj(m[1])
    const hashes = obj(m[2])
    const urls = Object.keys(hashes).map((id) => `/_next/static/chunks/${names[id] || id}.${hashes[id]}.js`)
    await Promise.all(urls.map((a) => cache.match(a).then((hit) => hit || fetch(a).then((r) => r.ok && cache.put(a, r)).catch(() => {}))))
  } catch {}
}

// Guarda una página y los archivos de la app que usa (scripts y estilos), para que abra sin internet
async function cachePage(cache, url) {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return
    await cache.put(url, res.clone())
    const html = await res.text()
    if (url === '/music/library') await cacheRuntimeChunks(cache, html)
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
    (async () => {
      // Los archivos de la app con hash (/_next/static) de la versión anterior se conservan: una
      // pantalla ya abierta puede seguir pidiéndolos (sobre todo sin conexión)
      const cache = await caches.open(CACHE)
      for (const k of await caches.keys()) {
        if (k === CACHE || k === IMG_CACHE) continue
        const old = await caches.open(k)
        for (const req of await old.keys()) {
          if (new URL(req.url).pathname.startsWith('/_next/static/') && !(await cache.match(req))) {
            const res = await old.match(req)
            if (res) await cache.put(req, res)
          }
        }
        if (k === IMG_CACHE) continue
        await caches.delete(k)
      }
      await self.clients.claim()
    })()
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  // Carátulas y fotos (de cualquier sitio): guardadas para verse sin internet
  if (
    (request.destination === 'image' || url.searchParams.get('cpn-img') === '1') &&
    /^https?:$/.test(url.protocol) &&
    !url.pathname.startsWith('/api/') &&
    !url.pathname.startsWith('/_next/')
  ) {
    if (url.searchParams.get('cpn-img') === '1') url.searchParams.delete('cpn-img')
    event.respondWith(imageResponse(request, url))
    return
  }
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
