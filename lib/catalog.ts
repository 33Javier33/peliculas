// Catálogo de álbumes y artistas (como en Spotify).
// - Datos (portadas, discografía, lista de canciones): API pública de Deezer, sin clave.
// - Sonido completo: YouTube. Se busca el álbum oficial de YouTube Music (todas las
//   canciones en orden) vía Piped y, si no está, cada canción por separado. Sin cuota.
import { getInstances, fetchJson } from '@/lib/audio-sources'
import { publicSearch, formatSeconds } from '@/lib/public-search'
import type { MusicVideo } from '@/lib/youtube-music'

// Se puede cambiar con DEEZER_API_BASE (p. ej. para pruebas)
const DEEZER = process.env.DEEZER_API_BASE || 'https://api.deezer.com'

export interface CatalogArtist {
  id: number
  name: string
  picture: string
  albums?: number
  fans?: number
}

export interface CatalogAlbum {
  id: number
  title: string
  cover: string
  artist: { id: number; name: string }
  year?: string
  type?: string // album | single | ep | compile
  tracks?: number
}

export interface CatalogTrack {
  id: number
  title: string
  duration: number // segundos
  position: number
  artist: string
}

export interface CatalogAlbumDetail extends CatalogAlbum {
  genres: string[]
  duration: number
  label?: string
  trackList: CatalogTrack[]
}

async function deezer<T>(path: string, revalidate = 86400): Promise<T> {
  const res = await fetch(`${DEEZER}${path}`, { next: { revalidate } })
  if (!res.ok) throw new Error(`Deezer ${res.status}`)
  const data = (await res.json()) as T & { error?: { message?: string } }
  // Deezer responde 200 con { error } cuando algo falla
  if (data && typeof data === 'object' && 'error' in data && data.error) throw new Error(data.error.message || 'Deezer error')
  return data
}

interface DzArtist {
  id: number
  name: string
  picture_xl?: string
  picture_big?: string
  picture_medium?: string
  nb_album?: number
  nb_fan?: number
}
interface DzAlbum {
  id: number
  title: string
  cover_xl?: string
  cover_big?: string
  cover_medium?: string
  release_date?: string
  record_type?: string
  nb_tracks?: number
  artist?: { id: number; name: string }
}

const mapArtist = (a: DzArtist): CatalogArtist => ({
  id: a.id,
  name: a.name,
  picture: a.picture_xl || a.picture_big || a.picture_medium || '',
  albums: a.nb_album,
  fans: a.nb_fan,
})

const mapAlbum = (a: DzAlbum, artist?: { id: number; name: string }): CatalogAlbum => ({
  id: a.id,
  title: a.title,
  cover: a.cover_xl || a.cover_big || a.cover_medium || '',
  artist: a.artist ?? artist ?? { id: 0, name: '' },
  year: a.release_date?.slice(0, 4),
  type: a.record_type,
  tracks: a.nb_tracks,
})

export async function searchCatalog(q: string) {
  const query = encodeURIComponent(q)
  const [artists, albums] = await Promise.all([
    deezer<{ data: DzArtist[] }>(`/search/artist?q=${query}&limit=8`, 3600).then((d) => d.data.map(mapArtist)).catch(() => []),
    deezer<{ data: DzAlbum[] }>(`/search/album?q=${query}&limit=12`, 3600).then((d) => d.data.map((a) => mapAlbum(a))).catch(() => []),
  ])
  return { artists, albums }
}

export async function getArtist(id: string) {
  const [artist, albums] = await Promise.all([
    deezer<DzArtist>(`/artist/${id}`).then(mapArtist),
    deezer<{ data: DzAlbum[] }>(`/artist/${id}/albums?limit=100`).then((d) => d.data),
  ])
  const list = albums.map((a) => mapAlbum(a, { id: artist.id, name: artist.name }))
  // Más recientes primero
  list.sort((a, b) => (b.year || '').localeCompare(a.year || ''))
  return { artist, albums: list }
}

export async function getAlbum(id: string): Promise<CatalogAlbumDetail> {
  const album = await deezer<
    DzAlbum & { duration?: number; label?: string; genres?: { data?: { name: string }[] } }
  >(`/album/${id}`)
  const tracks = await deezer<{
    data: { id: number; title: string; duration: number; track_position?: number; artist?: { name: string } }[]
  }>(`/album/${id}/tracks?limit=200`)
  return {
    ...mapAlbum(album),
    genres: album.genres?.data?.map((g) => g.name) ?? [],
    duration: album.duration ?? tracks.data.reduce((sum, t) => sum + (t.duration || 0), 0),
    label: album.label,
    trackList: tracks.data.map((t, i) => ({
      id: t.id,
      title: t.title,
      duration: t.duration,
      position: t.track_position ?? i + 1,
      artist: t.artist?.name || album.artist?.name || '',
    })),
  }
}

// ===== Del catálogo a canciones reproducibles (videos de YouTube) =====

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

interface PipedSearchItem {
  url?: string
  name?: string
  uploaderName?: string
  type?: string
}
interface PipedPlaylist {
  relatedStreams?: { url?: string; title?: string; duration?: number; uploaderName?: string }[]
}

/** Busca el álbum oficial de YouTube Music y devuelve sus videos en orden. */
async function findYouTubeMusicAlbum(artist: string, title: string): Promise<{ id: string; title: string; duration?: number }[]> {
  const { piped } = await getInstances()
  const q = encodeURIComponent(`${artist} ${title}`)
  const wanted = normalize(title)
  return Promise.any(
    piped.slice(0, 5).map(async (base) => {
      const found = await fetchJson<{ items?: PipedSearchItem[] }>(`${base}/search?q=${q}&filter=music_albums`, 8000)
      const match = (found.items ?? []).find((i) => {
        const name = normalize(i.name || '')
        return i.url?.includes('list=') && name && (name.includes(wanted) || wanted.includes(name))
      })
      if (!match?.url) throw new Error('sin álbum')
      const listId = new URLSearchParams(match.url.split('?')[1]).get('list')
      const playlist = await fetchJson<PipedPlaylist>(`${base}/playlists/${listId}`, 8000)
      const videos = (playlist.relatedStreams ?? [])
        .map((s) => ({ id: new URLSearchParams((s.url || '').split('?')[1]).get('v') || '', title: s.title || '', duration: s.duration }))
        .filter((v) => /^[A-Za-z0-9_-]{11}$/.test(v.id))
      if (videos.length === 0) throw new Error('vacío')
      return videos
    })
  ).catch(() => [])
}

/** Busca una canción suelta, preferentemente con una duración parecida. */
async function findTrack(artist: string, title: string, duration: number): Promise<string | null> {
  const results = await publicSearch(`${artist} - ${title} audio`).catch(() => [])
  const close = results.find((r) => r.lengthSeconds && Math.abs(r.lengthSeconds - duration) <= 15)
  return (close ?? results[0])?.id ?? null
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i])
      }
    })
  )
  return out
}

const playableCache = new Map<string, { at: number; tracks: MusicVideo[] }>()

/** Canciones del álbum listas para el reproductor (con el ID de YouTube de cada una). */
export async function getPlayableAlbum(id: string): Promise<MusicVideo[]> {
  const hit = playableCache.get(id)
  if (hit && Date.now() - hit.at < 24 * 60 * 60 * 1000) return hit.tracks

  const album = await getAlbum(id)
  const artist = album.artist.name
  const toVideo = (ytId: string, t: CatalogTrack): MusicVideo => ({
    id: ytId,
    title: `${t.artist || artist} - ${t.title}`,
    channelTitle: t.artist || artist,
    thumbnail: album.cover,
    publishedAt: album.year || '',
    description: album.title,
    duration: formatSeconds(t.duration),
    album: album.title,
  })

  let tracks: MusicVideo[] = []
  const ytAlbum = await findYouTubeMusicAlbum(artist, album.title)
  if (ytAlbum.length >= Math.max(1, Math.floor(album.trackList.length * 0.6))) {
    // Mismo orden que el álbum: se usan los títulos y duraciones de Deezer cuando coinciden en cantidad
    tracks = ytAlbum.map((v, i) => {
      const t = album.trackList[i]
      return t && ytAlbum.length === album.trackList.length
        ? toVideo(v.id, t)
        : { ...toVideo(v.id, { id: i, title: v.title, duration: v.duration || 0, position: i + 1, artist }), title: `${artist} - ${v.title}` }
    })
  } else {
    const ids = await mapLimit(album.trackList, 4, (t) => findTrack(t.artist || artist, t.title, t.duration))
    tracks = album.trackList.flatMap((t, i) => (ids[i] ? [toVideo(ids[i] as string, t)] : []))
  }

  if (tracks.length > 0) {
    playableCache.set(id, { at: Date.now(), tracks })
    if (playableCache.size > 200) playableCache.delete(playableCache.keys().next().value as string)
  }
  return tracks
}
