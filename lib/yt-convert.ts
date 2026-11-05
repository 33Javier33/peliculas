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
export function convertedTrack(v: { id: string; title: string; channelTitle?: string; thumbnail?: string; artist?: string }): MusicVideo {
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
    album: 'Convertidas de YouTube',
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

/** Dirección para bajar el audio como archivo (.m4a, se abre en cualquier reproductor) */
export const audioFileUrl = (id: string, name: string) => `/api/stream?id=${id}&dl=1&name=${encodeURIComponent(name)}`
