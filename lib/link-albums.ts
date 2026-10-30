// Discos desde enlaces (Internet Archive u otras páginas): convierte lo que entrega
// /api/audio-link en canciones y discos para el reproductor y la biblioteca.
import type { LinkAlbum } from '@/store/linksStore'
import type { MusicVideo } from '@/lib/youtube-music'

export interface ApiTrack {
  title: string
  url: string
  playUrl: string
  artist?: string
  duration?: number
}
export interface ApiAlbum {
  title: string
  artist?: string
  year?: string
  cover?: string
  description?: string
  source: string
  tracks: ApiTrack[]
}

const fmt = (s?: number) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : undefined)

export function toEntries(a: ApiAlbum): { album: Omit<LinkAlbum, 'trackIds' | 'addedAt'>; tracks: MusicVideo[] } {
  let host = ''
  try {
    host = new URL(a.source).hostname.replace(/^www\./, '')
  } catch {}
  const albumArtist = a.artist || host || 'Enlace'
  const tracks = a.tracks.map((t) => {
    // Sin artista: "Artista - Título" en el nombre del archivo
    const parts = t.title.split(/\s+[-–]\s+/)
    const artist = t.artist || (parts.length > 1 ? parts[0] : albumArtist)
    const title = !t.artist && parts.length > 1 ? parts.slice(1).join(' - ') : t.title
    return {
      id: `link-${hash(t.url)}`,
      title: `${artist} - ${title}`,
      channelTitle: artist,
      thumbnail: a.cover || '/icons/icon-512.png',
      publishedAt: '',
      description: t.url,
      duration: fmt(t.duration),
      album: a.title,
      audioUrl: t.playUrl,
    }
  })
  return {
    album: {
      id: `album-${hash(`${a.source}|${a.title}`)}`,
      title: a.title,
      artist: albumArtist,
      year: a.year,
      cover: a.cover,
      description: a.description,
      source: a.source,
    },
    tracks,
  }
}

export async function fetchAlbums(link: string): Promise<ApiAlbum[]> {
  const r = await fetch(`/api/audio-link?url=${encodeURIComponent(link)}`)
  const d = (await r.json()) as { albums?: ApiAlbum[]; tracks?: ApiTrack[]; error?: string }
  if (!r.ok || !d.tracks?.length) throw new Error(d.error || 'No se encontraron archivos de audio')
  return d.albums?.length ? d.albums : [{ title: link, source: link, tracks: d.tracks }]
}

function hash(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}
