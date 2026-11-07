// Convertir canciones de YouTube a audio: el servidor de la app saca solo el audio del video
// (/api/stream) y la canción queda en tu biblioteca como un audio más (como un MP3 de un enlace):
// se puede descargar para escucharla sin internet o bajar como archivo (.m4a).
import type { MusicVideo } from '@/lib/youtube-music'
import { create } from 'zustand'
import { useLinksStore } from '@/store/linksStore'
import { useOfflineStore } from '@/store/offlineStore'

export const CONVERTED_ALBUM = 'yt-convertidas'

/** ID del video de un enlace de YouTube (watch, youtu.be, shorts, music.youtube, embed) o el ID solo */
export function youTubeId(input: string): string | null {
  const s = input.trim()
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s
  try {
    const u = new URL(s.startsWith('http') ? s : `https://${s}`)
    const host = u.hostname.replace(/^(www|m|music)\./, '')
    if (host === 'youtu.be') return u.pathname.slice(1, 12) || null
    if (host !== 'youtube.com' && host !== 'youtube-nocookie.com') return null
    const v = u.searchParams.get('v')
    if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v
    const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})/)
    return m ? m[1] : null
  } catch {
    return null
  }
}

/** El audio de un video de YouTube, como canción de la biblioteca */
export function convertedTrack(
  v: { id: string; title: string; channelTitle?: string; thumbnail?: string; artist?: string; duration?: string },
  album?: { title: string; cover?: string }
): MusicVideo {
  const m = v.title.match(/^(.+?)\s[-–—]\s(.+)$/)
  const artist = (v.artist || (m ? m[1] : v.channelTitle) || '').replace(/\s*-\s*topic$/i, '').replace(/vevo$/i, '').trim()
  return {
    id: `yta-${v.id}`,
    title: m ? v.title : artist ? `${artist} - ${v.title}` : v.title,
    channelTitle: artist || v.channelTitle || '',
    artist: artist || undefined,
    thumbnail: v.thumbnail || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
    publishedAt: '',
    description: `https://www.youtube.com/watch?v=${v.id}`,
    audioUrl: `/api/stream?id=${v.id}`,
    album: album?.title || 'Convertidas de YouTube',
    duration: v.duration,
    ...(album?.cover ? { thumbnail: album.cover } : {}),
  } as MusicVideo
}

/** Lo guarda en la biblioteca (disco «Convertidas de YouTube») y, si se pide, lo descarga al teléfono */
export function saveConverted(tracks: MusicVideo[], download = true) {
  const links = useLinksStore.getState()
  const prev = links.albums.find((a) => a.id === CONVERTED_ALBUM)
  const prevTracks = prev ? links.tracks.filter((t) => prev.trackIds.includes(t.id)) : []
  const all = [...tracks, ...prevTracks.filter((t) => !tracks.some((x) => x.id === t.id))]
  links.addAlbum(
    { id: CONVERTED_ALBUM, title: 'Convertidas de YouTube', artist: 'Varios artistas', cover: tracks[0]?.thumbnail, source: 'https://www.youtube.com', description: 'Audio de videos de YouTube' },
    all
  )
  if (download) useOfflineStore.getState().download({ id: CONVERTED_ALBUM, title: 'Convertidas de YouTube', cover: tracks[0]?.thumbnail }, tracks)
}

/** Disco de la biblioteca para un álbum del catálogo descargado desde YouTube */
export const albumKey = (id: number | string) => `ytalb-${id}`

/**
 * Descargar un álbum completo (de los que se ven al buscar un artista): se busca el video de cada
 * canción, se convierte a audio y queda en tu biblioteca como un disco, listo sin internet.
 * Devuelve cuántas canciones se van a descargar.
 */
/** Las canciones de un álbum del catálogo, ya encontradas en YouTube */
export async function resolveCatalogAlbum(albumId: number | string, ready?: MusicVideo[]): Promise<MusicVideo[]> {
  const isYt = (t: MusicVideo) => !t.pending && /^[A-Za-z0-9_-]{11}$/.test(t.id)
  let tracks = (ready ?? []).filter(isYt)
  if (tracks.length && ready && tracks.length === ready.length) return tracks
  const d = (await fetch(`/api/catalog/album/${albumId}/play`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)) as { tracks?: MusicVideo[] } | null
  const full = (d?.tracks ?? []).filter(isYt)
  if (full.length >= tracks.length) tracks = full
  if (tracks.length) return tracks
  // Canción por canción (si no se encontró el álbum entero en YouTube)
  const q = (await fetch(`/api/catalog/album/${albumId}/play?quick=1`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)) as { tracks?: MusicVideo[] } | null
  const pend = q?.tracks ?? []
  const found: (MusicVideo | null)[] = new Array(pend.length).fill(null)
  let next = 0
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (next < pend.length) {
        const i = next++
        const p = pend[i].pending
        if (!p) {
          if (isYt(pend[i])) found[i] = pend[i]
          continue
        }
        const params = new URLSearchParams({ artist: p.artist, title: p.title, d: String(p.duration || 0) })
        const r = (await fetch(`/api/catalog/resolve?${params}`).then((x) => (x.ok ? x.json() : null)).catch(() => null)) as { id?: string } | null
        if (r?.id) found[i] = { ...pend[i], id: r.id, pending: undefined }
      }
    })
  )
  return found.filter((t): t is MusicVideo => !!t)
}

/** Convierte las canciones de un álbum del catálogo y lo deja como disco de tu biblioteca */
function catalogAlbumGroup(album: { id: number | string; title: string; artist: string; cover?: string }, tracks: MusicVideo[]) {
  const conv = tracks.map((t) => convertedTrack({ ...t, artist: t.channelTitle }, { title: album.title, cover: album.cover }))
  const id = albumKey(album.id)
  useLinksStore.getState().addAlbum({ id, title: album.title, artist: album.artist, cover: album.cover, source: 'https://www.youtube.com', description: 'Álbum convertido de YouTube' }, conv)
  return { group: { id, title: album.title, cover: album.cover }, tracks: conv }
}

/**
 * Descargar un álbum completo (de los que se ven al buscar un artista): se busca el video de cada
 * canción, se convierte a audio y queda en tu biblioteca como un disco, listo sin internet.
 * Devuelve cuántas canciones se van a descargar.
 */
export async function downloadCatalogAlbum(
  album: { id: number | string; title: string; artist: string; cover?: string },
  ready?: MusicVideo[]
): Promise<number> {
  const tracks = await resolveCatalogAlbum(album.id, ready)
  if (!tracks.length) return 0
  const g = catalogAlbumGroup(album, tracks)
  useOfflineStore.getState().download(g.group, g.tracks)
  return g.tracks.length
}

/** Dirección para bajar el audio como archivo (.m4a, se abre en cualquier reproductor) */
export const audioFileUrl = (id: string, name: string) => `/api/stream?id=${id}&dl=1&name=${encodeURIComponent(name)}`

/** Estado de «Descargar toda mi biblioteca» (para mostrar en qué va) */
export const useLibraryJob = create<{ running: boolean; index: number; total: number; title: string; phase: 'buscando' | 'descargando'; songs: number; gid: string }>()(() => ({
  gid: '',
  running: false,
  index: 0,
  total: 0,
  title: '',
  phase: 'buscando',
  songs: 0,
}))

/**
 * Descargar toda la biblioteca: discos de la biblioteca, álbumes guardados con ♥ y Me gusta.
 * Las canciones de YouTube se convierten a audio; los álbumes guardados desde una carátula (sus
 * canciones aún sin buscar) se buscan en YouTube primero. Un disco tras otro (no satura la
 * conexión); lo ya descargado se salta. Devuelve cuántas canciones faltaban.
 */
export async function downloadWholeLibrary(): Promise<number> {
  if (useLibraryJob.getState().running) return 0
  const { useMusicStore } = await import('@/store/musicStore')
  const links = useLinksStore.getState()
  const music = useMusicStore.getState()
  const isYt = (t: MusicVideo) => !t.audioUrl && !t.streamUrl && !t.pending && /^[A-Za-z0-9_-]{11}$/.test(t.id)
  const toAudio = (t: MusicVideo, album?: { title: string; cover?: string }) =>
    isYt(t) ? { ...convertedTrack({ ...t, artist: t.channelTitle }, album), id: t.id } : t
  type Job = { title: string; get: () => Promise<{ group: { id: string; title: string; cover?: string }; tracks: MusicVideo[] } | null> }
  const jobs: Job[] = []
  const seen = new Set<string>()
  for (const a of links.albums) {
    seen.add(a.id)
    const tracks = links.tracks.filter((t) => a.trackIds.includes(t.id))
    jobs.push({ title: a.title, get: async () => ({ group: { id: a.id, title: a.title, cover: a.cover }, tracks }) })
  }
  for (const a of music.savedAlbums) {
    const dz = a.id.match(/^deezer-(\d+)$/)?.[1]
    if (seen.has(a.id) || (dz && seen.has(albumKey(dz)))) continue
    const ready = a.tracks.filter(isYt)
    if (dz && ready.length < a.tracks.length) {
      // Guardado desde una carátula: sus canciones se buscan en YouTube ahora
      jobs.push({
        title: a.title,
        get: async () => {
          const tracks = await resolveCatalogAlbum(dz, a.tracks).catch(() => [])
          return tracks.length ? catalogAlbumGroup({ id: dz, title: a.title, artist: a.artist, cover: a.cover }, tracks) : null
        },
      })
    } else {
      jobs.push({ title: a.title, get: async () => ({ group: { id: a.id, title: a.title, cover: a.cover }, tracks: a.tracks.map((t) => toAudio(t, { title: a.title, cover: a.cover })) }) })
    }
  }
  if (music.saved.length) jobs.push({ title: 'Me gusta', get: async () => ({ group: { id: 'me-gusta', title: 'Me gusta' }, tracks: music.saved.map((t) => toAudio(t)) }) })
  const off = useOfflineStore.getState()
  const missing = (tracks: MusicVideo[]) => tracks.filter((t) => t.audioUrl && !t.streamUrl && !useOfflineStore.getState().items[t.audioUrl])
  if (!jobs.length) {
    off.notify('Tu biblioteca está vacía: guarda discos o canciones con ♥')
    return 0
  }
  off.notify(`Descargando tu biblioteca (${jobs.length} discos)… puedes salir de la app, la descarga sigue`)
  useLibraryJob.setState({ running: true, index: 0, total: jobs.length, title: '', phase: 'buscando', songs: 0 })
  let songs = 0
  try {
    for (let i = 0; i < jobs.length; i++) {
      useLibraryJob.setState({ index: i + 1, title: jobs[i].title, phase: 'buscando' })
      const g = await jobs[i].get().catch(() => null)
      if (!g) continue
      const list = missing(g.tracks)
      if (!list.length) continue
      songs += list.length
      useLibraryJob.setState({ phase: 'descargando', songs, gid: g.group.id })
      await useOfflineStore.getState().download(g.group, list, true)
    }
  } finally {
    useLibraryJob.setState({ running: false })
  }
  useOfflineStore.getState().notify(songs ? `✓ Biblioteca revisada: ${songs} canciones bajadas (las que fallaron se reintentan solas)` : 'Toda tu biblioteca ya está descargada')
  return songs
}
