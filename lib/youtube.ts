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

export async function searchMoviesOnYouTube(
  query: string,
  pageToken?: string
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

  const enhancedQuery = `${query.trim()} pelicula completa español latino`

  const url = new URL(`${YOUTUBE_API_BASE}/search`)
  url.searchParams.set('key', apiKey)
  url.searchParams.set('q', enhancedQuery)
  url.searchParams.set('part', 'snippet')
  url.searchParams.set('type', 'video')
  url.searchParams.set('videoDuration', 'long')
  url.searchParams.set('maxResults', '20')
  url.searchParams.set('relevanceLanguage', 'es')
  url.searchParams.set('regionCode', 'MX')
  url.searchParams.set('videoEmbeddable', 'true')
  url.searchParams.set('safeSearch', 'none')
  if (pageToken) {
    url.searchParams.set('pageToken', pageToken)
  }

  const response = await fetch(url.toString(), { cache: 'no-store' })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}))
    const message =
      errorBody?.error?.message || `YouTube API error: ${response.status} ${response.statusText}`
    throw new Error(message)
  }

  return response.json() as Promise<YouTubeSearchResponse>
}

export async function getTrendingMoviesOnYouTube(): Promise<YouTubeSearchResponse> {
  const apiKey = getYouTubeApiKey()

  const url = new URL(`${YOUTUBE_API_BASE}/search`)
  url.searchParams.set('key', apiKey)
  url.searchParams.set('q', 'pelicula completa español latino 2024 HD')
  url.searchParams.set('part', 'snippet')
  url.searchParams.set('type', 'video')
  url.searchParams.set('videoDuration', 'long')
  url.searchParams.set('maxResults', '20')
  url.searchParams.set('order', 'viewCount')
  url.searchParams.set('relevanceLanguage', 'es')
  url.searchParams.set('regionCode', 'MX')
  url.searchParams.set('videoEmbeddable', 'true')
  url.searchParams.set('publishedAfter', '2023-01-01T00:00:00Z')

  const response = await fetch(url.toString(), {
    next: { revalidate: 3600 },
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}))
    const message =
      errorBody?.error?.message || `YouTube API error: ${response.status} ${response.statusText}`
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
