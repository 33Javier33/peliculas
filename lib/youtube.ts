import { publicSearch, isQuotaBlocked, noteYouTubeError, type PublicVideo } from '@/lib/public-search'

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3'

export interface YouTubeVideoSnippet {
  publishedAt: string
  channelId: string
  title: string
  description: string
  thumbnails: {
    default: { url: string; width: number; height: number }
    medium: { url: string; width: number; height: number }
    high: { url: string; width: number; height: number }
    standard?: { url: string; width: number; height: number }
    maxres?: { url: string; width: number; height: number }
  }
  channelTitle: string
  liveBroadcastContent: string
}

export interface YouTubeSearchItem {
  kind: string
  etag: string
  id: { kind: string; videoId: string }
  snippet: YouTubeVideoSnippet
}

export interface YouTubeSearchResponse {
  kind: string
  etag: string
  nextPageToken?: string
  prevPageToken?: string
  pageInfo: { totalResults: number; resultsPerPage: number }
  items: YouTubeSearchItem[]
}

export interface YouTubeVideoStatistics {
  viewCount: string
  likeCount?: string
  commentCount?: string
}

export interface YouTubeVideoContentDetails {
  duration: string
  dimension: string
  definition: string
  caption: string
}

export interface YouTubeVideoItem {
  id: string
  snippet: YouTubeVideoSnippet
  statistics: YouTubeVideoStatistics
  contentDetails: YouTubeVideoContentDetails
}

export interface YouTubeVideosResponse {
  items: YouTubeVideoItem[]
}

function getYouTubeApiKey(): string {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) {
    throw new Error(
      'YOUTUBE_API_KEY no está configurada. Agrégala en tu archivo .env.local.'
    )
  }
  return key
}

// ===== Idiomas de la sección Videos =====

export type VideoLang = 'latino' | 'castellano' | 'ingles' | 'todo'

export const VIDEO_LANGS: Record<VideoLang, { suffix: string; trending: string; region: string; language: string }> = {
  latino: { suffix: 'pelicula completa español latino', trending: 'pelicula completa español latino HD', region: 'MX', language: 'es' },
  castellano: { suffix: 'película completa en castellano', trending: 'película completa castellano HD', region: 'ES', language: 'es' },
  ingles: { suffix: 'full movie english', trending: 'full movie english HD', region: 'US', language: 'en' },
  // Todo YouTube: cualquier video (videoclips, artistas, programas…), sin filtro de película
  todo: { suffix: '', trending: '', region: 'CL', language: 'es' },
}

export function parseVideoLang(value: string | null | undefined): VideoLang {
  return value === 'castellano' || value === 'ingles' || value === 'todo' ? value : 'latino'
}

// ===== Respaldo sin cuota (Invidious/Piped) =====

function publicToSearchItem(v: PublicVideo): YouTubeSearchItem {
  const t = { url: v.thumbnail, width: 480, height: 360 }
  return {
    kind: 'youtube#searchResult',
    etag: '',
    id: { kind: 'youtube#video', videoId: v.id },
    snippet: {
      publishedAt: '',
      channelId: '',
      title: v.title,
      description: '',
      thumbnails: { default: t, medium: t, high: t },
      channelTitle: v.author,
      liveBroadcastContent: 'none',
    },
  }
}

const PUBLIC_PAGE = /^pub:(\d+)$/

async function publicMovieSearch(query: string, page: number, onlyLong = true): Promise<YouTubeSearchResponse> {
  // Solo películas largas (más de 40 minutos) cuando se conoce la duración
  const found = (await publicSearch(query, page)).filter((v) => !onlyLong || !v.lengthSeconds || v.lengthSeconds >= 40 * 60)
  if (found.length === 0 && page === 1) throw new Error('La búsqueda no está disponible por ahora')
  return {
    kind: 'youtube#searchListResponse',
    etag: '',
    nextPageToken: found.length > 0 ? `pub:${page + 1}` : undefined,
    pageInfo: { totalResults: found.length, resultsPerPage: found.length },
    items: found.map(publicToSearchItem),
  }
}

export async function searchMoviesOnYouTube(
  query: string,
  pageToken?: string,
  lang: VideoLang = 'latino'
): Promise<YouTubeSearchResponse> {
  const publicPage = pageToken?.match(PUBLIC_PAGE)
  if (query.trim() && !publicPage && !isQuotaBlocked()) {
    try {
      return await searchMoviesOnYouTubeApi(query, pageToken, lang)
    } catch {
      // Cuota agotada o error de YouTube: se sigue con el respaldo
    }
  }
  if (!query.trim()) return searchMoviesOnYouTubeApi(query, pageToken, lang)
  return publicMovieSearch(`${query.trim()} ${VIDEO_LANGS[lang].suffix}`.trim(), publicPage ? Number(publicPage[1]) : 1, lang !== 'todo')
}

export async function getTrendingMoviesOnYouTube(lang: VideoLang = 'latino', pageToken?: string): Promise<YouTubeSearchResponse> {
  const publicPage = pageToken?.match(PUBLIC_PAGE)
  if (!publicPage && !isQuotaBlocked()) {
    try {
      return await getTrendingMoviesOnYouTubeApi(lang, pageToken)
    } catch {
      // Respaldo abajo
    }
  }
  return publicMovieSearch(lang === 'todo' ? 'videos musicales tendencias' : VIDEO_LANGS[lang].trending, publicPage ? Number(publicPage[1]) : 1, lang !== 'todo')
}

async function searchMoviesOnYouTubeApi(
  query: string,
  pageToken: string | undefined,
  lang: VideoLang
): Promise<YouTubeSearchResponse> {
  const apiKey = getYouTubeApiKey()

  if (!query.trim()) {
    return {
      kind: 'youtube#searchListResponse',
      etag: '',
      pageInfo: { totalResults: 0, resultsPerPage: 0 },
      items: [],
    }
  }

  const enhancedQuery = `${query.trim()} ${VIDEO_LANGS[lang].suffix}`.trim()

  const url = new URL(`${YOUTUBE_API_BASE}/search`)
  url.searchParams.set('key', apiKey)
  url.searchParams.set('q', enhancedQuery)
  url.searchParams.set('part', 'snippet')
  url.searchParams.set('type', 'video')
  if (lang !== 'todo') url.searchParams.set('videoDuration', 'long')
  url.searchParams.set('maxResults', '20')
  url.searchParams.set('relevanceLanguage', VIDEO_LANGS[lang].language)
  url.searchParams.set('regionCode', VIDEO_LANGS[lang].region)
  url.searchParams.set('videoEmbeddable', 'true')
  url.searchParams.set('safeSearch', 'none')
  if (pageToken) {
    url.searchParams.set('pageToken', pageToken)
  }

  // Caché de 6 h: repetir una búsqueda no gasta cuota
  const response = await fetch(url.toString(), { next: { revalidate: 21600 } })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}))
    const message =
      errorBody?.error?.message || `YouTube API error: ${response.status} ${response.statusText}`
    noteYouTubeError(response.status, message)
    throw new Error(message)
  }

  return response.json() as Promise<YouTubeSearchResponse>
}

async function getTrendingMoviesOnYouTubeApi(lang: VideoLang, pageToken?: string): Promise<YouTubeSearchResponse> {
  const apiKey = getYouTubeApiKey()

  // Todo YouTube: lo más popular del país (1 unidad de cuota en vez de 100)
  if (lang === 'todo') {
    const u = new URL(`${YOUTUBE_API_BASE}/videos`)
    u.searchParams.set('key', apiKey)
    u.searchParams.set('chart', 'mostPopular')
    u.searchParams.set('regionCode', VIDEO_LANGS.todo.region)
    u.searchParams.set('part', 'snippet')
    u.searchParams.set('maxResults', '24')
    if (pageToken) u.searchParams.set('pageToken', pageToken)
    const r = await fetch(u.toString(), { next: { revalidate: 3600 } })
    if (!r.ok) {
      const body = await r.json().catch(() => ({}))
      const message = body?.error?.message || `YouTube API error: ${r.status}`
      noteYouTubeError(r.status, message)
      throw new Error(message)
    }
    const d = (await r.json()) as { items: { id: string; snippet: YouTubeSearchItem['snippet'] }[]; nextPageToken?: string; pageInfo?: YouTubeSearchResponse['pageInfo'] }
    return {
      kind: 'youtube#searchListResponse',
      etag: '',
      nextPageToken: d.nextPageToken,
      pageInfo: d.pageInfo ?? { totalResults: d.items.length, resultsPerPage: d.items.length },
      items: d.items.map((v) => ({ kind: 'youtube#searchResult', etag: '', id: { kind: 'youtube#video', videoId: v.id }, snippet: v.snippet })),
    }
  }

  const url = new URL(`${YOUTUBE_API_BASE}/search`)
  url.searchParams.set('key', apiKey)
  url.searchParams.set('q', VIDEO_LANGS[lang].trending)
  if (pageToken) url.searchParams.set('pageToken', pageToken)
  url.searchParams.set('part', 'snippet')
  url.searchParams.set('type', 'video')
  url.searchParams.set('videoDuration', 'long')
  url.searchParams.set('maxResults', '20')
  url.searchParams.set('order', 'viewCount')
  url.searchParams.set('relevanceLanguage', VIDEO_LANGS[lang].language)
  url.searchParams.set('regionCode', VIDEO_LANGS[lang].region)
  url.searchParams.set('videoEmbeddable', 'true')
  url.searchParams.set('publishedAfter', '2023-01-01T00:00:00Z')

  const response = await fetch(url.toString(), {
    next: { revalidate: 21600 },
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}))
    const message =
      errorBody?.error?.message || `YouTube API error: ${response.status} ${response.statusText}`
    noteYouTubeError(response.status, message)
    throw new Error(message)
  }

  return response.json() as Promise<YouTubeSearchResponse>
}

export async function getVideoDetails(videoIds: string[]): Promise<YouTubeVideosResponse> {
  if (videoIds.length === 0) return { items: [] }

  const apiKey = getYouTubeApiKey()

  const url = new URL(`${YOUTUBE_API_BASE}/videos`)
  url.searchParams.set('key', apiKey)
  url.searchParams.set('id', videoIds.join(','))
  url.searchParams.set('part', 'snippet,statistics,contentDetails')

  const response = await fetch(url.toString(), {
    next: { revalidate: 3600 },
  })

  if (!response.ok) {
    return { items: [] }
  }

  return response.json() as Promise<YouTubeVideosResponse>
}

export function parseDuration(isoDuration: string): string {
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!match) return ''
  const hours = parseInt(match[1] || '0', 10)
  const minutes = parseInt(match[2] || '0', 10)
  const seconds = parseInt(match[3] || '0', 10)
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function formatViewCount(count: string): string {
  const n = parseInt(count, 10)
  if (isNaN(n)) return ''
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M vistas`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K vistas`
  return `${n} vistas`
}

export function getBestThumbnail(item: YouTubeSearchItem): string {
  const t = item.snippet.thumbnails
  return (
    t.maxres?.url ||
    t.standard?.url ||
    t.high?.url ||
    t.medium?.url ||
    t.default?.url ||
    ''
  )
}

export function timeAgo(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays < 1) return 'Hoy'
  if (diffDays === 1) return 'Ayer'
  if (diffDays < 30) return `hace ${diffDays} días`
  if (diffDays < 365) return `hace ${Math.floor(diffDays / 30)} meses`
  return `hace ${Math.floor(diffDays / 365)} años`
}
