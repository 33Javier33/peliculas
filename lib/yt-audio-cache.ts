// Web (navegador, sin la app de Android): el audio de los videos y canciones de YouTube que se ven
// queda guardado en el dispositivo (Cache Storage). Así, al bloquear el teléfono, minimizar o
// cambiar de pestaña el video sigue sonando al instante desde esa copia, y se puede volver a
// escuchar sin esperar. Se guardan las últimas 150 (las más viejas se borran solas).
import { isNativeApp } from '@/lib/native'

const CACHE = 'cpn-yt-audio-v1'
const INDEX = 'cpn-yt-audio-index'
const MAX_ITEMS = 150
const MAX_SIZE = 40 * 1024 * 1024
const keyUrl = (id: string) => `/__yt-audio/${id}`

const inflight = new Map<string, Promise<string | null>>()
const blobUrls = new Map<string, string>()

function readIndex(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(INDEX) || '{}') as Record<string, number>
  } catch {
    return {}
  }
}
function writeIndex(ix: Record<string, number>) {
  try {
    localStorage.setItem(INDEX, JSON.stringify(ix))
  } catch {}
}

const available = () => typeof window !== 'undefined' && 'caches' in window && !isNativeApp()

/** Copia guardada en el dispositivo (blob:…) o null */
export async function cachedYtAudio(id: string): Promise<string | null> {
  if (!available()) return null
  const hit = blobUrls.get(id)
  if (hit) return hit
  try {
    const c = await caches.open(CACHE)
    const r = await c.match(keyUrl(id))
    if (!r) return null
    const url = URL.createObjectURL(await r.blob())
    blobUrls.set(id, url)
    const ix = readIndex()
    ix[id] = Date.now()
    writeIndex(ix)
    return url
  } catch {
    return null
  }
}

/** Baja el audio de un video al dispositivo (una vez); devuelve la copia (blob:…) o null */
export function cacheYtAudio(id: string): Promise<string | null> {
  if (!available() || !/^[A-Za-z0-9_-]{11}$/.test(id)) return Promise.resolve(null)
  const running = inflight.get(id)
  if (running) return running
  const job = (async () => {
    const have = await cachedYtAudio(id)
    if (have) return have
    const c = (navigator as unknown as { connection?: { saveData?: boolean } }).connection
    if (c?.saveData) return null
    try {
      const r = await fetch(`/api/stream?id=${id}`)
      if (!r.ok) return null
      const blob = await r.blob()
      if (blob.size < 50_000 || blob.size > MAX_SIZE) return null
      const cache = await caches.open(CACHE)
      await cache.put(keyUrl(id), new Response(blob, { headers: { 'Content-Type': r.headers.get('content-type') || 'audio/mp4', 'Content-Length': String(blob.size) } }))
      const ix = readIndex()
      ix[id] = Date.now()
      // Las más viejas se borran (no se llena el teléfono)
      const old = Object.entries(ix).sort((a, b) => b[1] - a[1]).slice(MAX_ITEMS)
      for (const [oid] of old) {
        delete ix[oid]
        cache.delete(keyUrl(oid)).catch(() => {})
      }
      writeIndex(ix)
      const url = URL.createObjectURL(blob)
      blobUrls.set(id, url)
      return url
    } catch {
      return null
    } finally {
      inflight.delete(id)
    }
  })()
  inflight.set(id, job)
  return job
}

/** ¿Computador? (ahí los videos siguen sonando solos al minimizar o cambiar de pestaña) */
export const isDesktop = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine) and (hover: hover)').matches
