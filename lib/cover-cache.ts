// Carátulas para verse sin internet: se piden una vez (el service worker las guarda en su caché de
// imágenes, que no se borra con las actualizaciones). Aquí solo se "visitan" en segundo plano.
import type { MusicVideo } from '@/lib/youtube-music'
import { useOfflineStore } from '@/store/offlineStore'
import { useMusicStore } from '@/store/musicStore'
import { useLinksStore } from '@/store/linksStore'

const done = new Set<string>()
let running = false
const queue: string[] = []

/** Guarda estas carátulas (las que no se guardaron ya en esta sesión) */
export function warmCovers(urls: (string | undefined)[]) {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return
  for (const u of urls) if (u && /^https?:\/\//.test(u) && !done.has(u)) (done.add(u), queue.push(u))
  if (running) return
  running = true
  const next = async (): Promise<void> => {
    const u = queue.shift()
    if (!u) return
    if (!navigator.onLine) {
      queue.unshift(u)
      return
    }
    const sep = u.includes('?') ? '&' : '?'
    // El service worker la sirve y la guarda (cpn-img=1 le indica que es una carátula)
    await fetch(`${u}${sep}cpn-img=1`, { mode: 'no-cors', credentials: 'omit' }).catch(() => {})
    return next()
  }
  Promise.all([next(), next(), next()]).finally(() => {
    running = false
    if (queue.length && navigator.onLine) warmCovers([])
  })
}

const thumb = (t: MusicVideo) => t.thumbnail

/** Todo lo de tu biblioteca: descargas primero, luego álbumes guardados, discos y me gusta */
export function warmLibraryCovers() {
  const off = Object.values(useOfflineStore.getState().items)
  const { savedAlbums, saved } = useMusicStore.getState()
  const links = useLinksStore.getState()
  warmCovers([
    ...off.map((i) => i.groupCover),
    ...off.map((i) => thumb(i.track)),
    ...savedAlbums.map((a) => a.cover),
    ...links.albums.map((a) => a.cover),
    ...[...saved].sort((a, b) => b.savedAt - a.savedAt).slice(0, 400).map(thumb),
    ...links.tracks.slice(0, 300).map(thumb),
  ])
}
