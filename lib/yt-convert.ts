// Convertir canciones de YouTube a audio: el servidor de la app saca solo el audio del video
// (/api/stream) y la canción queda en tu biblioteca como un audio más (como un MP3 de un enlace):
// se puede descargar para escucharla sin internet o bajar como archivo (.m4a).
import type { MusicVideo } from '@/lib/youtube-music'
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
export async function downloadCatalogAlbum(
  album: { id: number | string; title: string; artist: string; cover?: string },
  ready?: MusicVideo[]
): Promise<number> {
  const isYt = (t: MusicVideo) => /^[A-Za-z0-9_-]{11}$/.test(t.id)
  let tracks = (ready ?? []).filter(isYt)
  if (!tracks.length) {
    const d = (await fetch(`/api/catalog/album/${album.id}/play`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)) as { tracks?: MusicVideo[] } | null
    tracks = (d?.tracks ?? []).filter(isYt)
  }
  if (!tracks.length) {
    // Canción por canción (si no se encontró el álbum entero en YouTube)
    const q = (await fetch(`/api/catalog/album/${album.id}/play?quick=1`)
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
          if (!p) continue
          const params = new URLSearchParams({ artist: p.artist, title: p.title, d: String(p.duration || 0) })
          const r = (await fetch(`/api/catalog/resolve?${params}`).then((x) => (x.ok ? x.json() : null)).catch(() => null)) as { id?: string } | null
          if (r?.id) found[i] = { ...pend[i], id: r.id, pending: undefined }
        }
      })
    )
    tracks = found.filter((t): t is MusicVideo => !!t)
  }
  if (!tracks.length) return 0
  const conv = tracks.map((t) => convertedTrack({ ...t, artist: t.channelTitle }, { title: album.title, cover: album.cover }))
  const id = albumKey(album.id)
  useLinksStore.getState().addAlbum({ id, title: album.title, artist: album.artist, cover: album.cover, source: 'https://www.youtube.com', description: 'Álbum convertido de YouTube' }, conv)
  useOfflineStore.getState().download({ id, title: album.title, cover: album.cover }, conv)
  return conv.length
}

/** Dirección para bajar el audio como archivo (.m4a, se abre en cualquier reproductor) */
export const audioFileUrl = (id: string, name: string) => `/api/stream?id=${id}&dl=1&name=${encodeURIComponent(name)}`
