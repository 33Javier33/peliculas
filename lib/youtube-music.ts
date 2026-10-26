const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3'

export interface MusicVideo {
  id: string
  title: string
  channelTitle: string
  thumbnail: string
  publishedAt: string
  description: string
  duration?: string
  viewCount?: string
  likeCount?: string
}

export interface MusicSearchResult {
  videos: MusicVideo[]
  nextPageToken?: string
}

function getKey(): string {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) throw new Error('YOUTUBE_API_KEY no está configurada. Agrégala en .env.local')
  return key
}

function parseDuration(iso: string): string {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!m) return ''
  const h = parseInt(m[1] || '0', 10)
  const min = parseInt(m[2] || '0', 10)
  const s = parseInt(m[3] || '0', 10)
  if (h > 0) return `${h}:${String(min).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${min}:${String(s).padStart(2, '0')}`
}

function formatViews(count: string): string {
  const n = parseInt(count, 10)
  if (isNaN(n)) return ''
  if (n >= 1_000_000_000) return `${(n / 1e9).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1e3).toFixed(0)}K`
  return String(n)
}

function bestThumbnail(thumbnails: Record<string, { url: string }>): string {
  return (
    thumbnails.maxres?.url ||
    thumbnails.standard?.url ||
    thumbnails.high?.url ||
    thumbnails.medium?.url ||
    thumbnails.default?.url ||
    ''
  )
}

function normalizeChartItem(item: {
  id: string
  snippet: {
    title: string
    channelTitle: string
    thumbnails: Record<string, { url: string }>
    publishedAt: string
    description: string
  }
  statistics?: { viewCount?: string; likeCount?: string }
  contentDetails?: { duration?: string }
}): MusicVideo {
  return {
    id: item.id,
    title: item.snippet.title,
    channelTitle: item.snippet.channelTitle,
    thumbnail: bestThumbnail(item.snippet.thumbnails),
    publishedAt: item.snippet.publishedAt,
    description: item.snippet.description || '',
    duration: item.contentDetails?.duration
      ? parseDuration(item.contentDetails.duration)
      : undefined,
    viewCount: item.statistics?.viewCount
      ? formatViews(item.statistics.viewCount)
      : undefined,
    likeCount: item.statistics?.likeCount
      ? formatViews(item.statistics.likeCount)
      : undefined,
  }
}

export async function getTrendingMusicVideos(regionCode = 'MX'): Promise<MusicVideo[]> {
  const key = getKey()

  const url = new URL(`${YOUTUBE_API_BASE}/videos`)
  url.searchParams.set('key', key)
  url.searchParams.set('part', 'snippet,statistics,contentDetails')
  url.searchParams.set('chart', 'mostPopular')
  url.searchParams.set('videoCategoryId', '10')
  url.searchParams.set('regionCode', regionCode)
  url.searchParams.set('maxResults', '24')
  url.searchParams.set('hl', 'es')

  const res = await fetch(url.toString(), { next: { revalidate: 3600 } })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      body?.error?.message || `YouTube API error: ${res.status} ${res.statusText}`
    )
  }

  const data = await res.json()
  return (data.items ?? []).map(normalizeChartItem)
}

export async function searchMusicVideos(
  query: string,
  pageToken?: string,
  maxResults = 20
): Promise<MusicSearchResult> {
  if (!query.trim()) return { videos: [] }

  const key = getKey()

  const searchUrl = new URL(`${YOUTUBE_API_BASE}/search`)
  searchUrl.searchParams.set('key', key)
  searchUrl.searchParams.set('q', `${query.trim()} official`)
  searchUrl.searchParams.set('part', 'snippet')
  searchUrl.searchParams.set('type', 'video')
  searchUrl.searchParams.set('videoCategoryId', '10')
  searchUrl.searchParams.set('videoDefinition', 'high')
  searchUrl.searchParams.set('videoEmbeddable', 'true')
  searchUrl.searchParams.set('maxResults', String(maxResults))
  searchUrl.searchParams.set('relevanceLanguage', 'es')
  searchUrl.searchParams.set('regionCode', 'MX')
  if (pageToken) searchUrl.searchParams.set('pageToken', pageToken)

  const searchRes = await fetch(searchUrl.toString(), { cache: 'no-store' })

  if (!searchRes.ok) {
    const body = await searchRes.json().catch(() => ({}))
    throw new Error(
      body?.error?.message || `YouTube API error: ${searchRes.status} ${searchRes.statusText}`
    )
  }

  const searchData = await searchRes.json()
  const items: { id: { videoId: string }; snippet: { title: string; channelTitle: string; thumbnails: Record<string, { url: string }>; publishedAt: string; description: string } }[] = searchData.items ?? []

  const ids = items.map((i) => i.id.videoId).filter(Boolean).join(',')
  const detailsMap: Record<string, { statistics?: { viewCount?: string; likeCount?: string }; contentDetails?: { duration?: string } }> = {}

  if (ids) {
    const detailsUrl = new URL(`${YOUTUBE_API_BASE}/videos`)
    detailsUrl.searchParams.set('key', key)
    detailsUrl.searchParams.set('id', ids)
    detailsUrl.searchParams.set('part', 'statistics,contentDetails')

    const detailsRes = await fetch(detailsUrl.toString(), { next: { revalidate: 3600 } })
    if (detailsRes.ok) {
      const detailsData = await detailsRes.json()
      for (const v of detailsData.items ?? []) {
        detailsMap[v.id] = v
      }
    }
  }

  const videos: MusicVideo[] = items.map((item) => {
    const d = detailsMap[item.id.videoId]
    return {
      id: item.id.videoId,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      thumbnail: bestThumbnail(item.snippet.thumbnails),
      publishedAt: item.snippet.publishedAt,
      description: item.snippet.description || '',
      duration: d?.contentDetails?.duration
        ? parseDuration(d.contentDetails.duration)
        : undefined,
      viewCount: d?.statistics?.viewCount
        ? formatViews(d.statistics.viewCount)
        : undefined,
      likeCount: d?.statistics?.likeCount
        ? formatViews(d.statistics.likeCount)
        : undefined,
    }
  })

  return { videos, nextPageToken: searchData.nextPageToken }
}

// ===== Recomendaciones "Para ti" =====

export interface ForYouResult {
  videos: MusicVideo[]
  genres: string[]
  artists: string[]
}

// Géneros de YouTube (topicDetails → Wikipedia) a términos de búsqueda en español
const GENRE_LABELS: Record<string, string> = {
  Rock_music: 'rock',
  Heavy_metal: 'metal',
  Hip_hop_music: 'hip hop',
  Pop_music: 'pop',
  Electronic_music: 'electrónica',
  Music_of_Latin_America: 'música latina',
  Reggae: 'reggae',
  Reggaeton: 'reggaetón',
  Country_music: 'country',
  Jazz: 'jazz',
  Soul_music: 'soul',
  Rhythm_and_blues: 'r&b',
  Classical_music: 'música clásica',
  Christian_music: 'música cristiana',
  Independent_music: 'indie',
  Music_of_Asia: 'k-pop',
  Blues: 'blues',
  Punk_rock: 'punk',
  Alternative_rock: 'rock alternativo',
  Folk_music: 'folk',
}

/** Géneros más presentes en los videos escuchados, según YouTube (topicDetails). */
async function detectGenres(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return []
  const url = new URL(`${YOUTUBE_API_BASE}/videos`)
  url.searchParams.set('key', getKey())
  url.searchParams.set('id', ids.slice(0, 50).join(','))
  url.searchParams.set('part', 'topicDetails')
  const res = await fetch(url.toString(), { next: { revalidate: 86400 } })
  if (!res.ok) return []
  const data = await res.json()

  const count = new Map<string, number>()
  // Los primeros ids son lo más reciente: pesan más
  ;(data.items ?? []).forEach((item: { topicDetails?: { topicCategories?: string[] } }, i: number) => {
    const weight = 1 + Math.max(0, 10 - i) / 10
    for (const cat of item.topicDetails?.topicCategories ?? []) {
      const slug = decodeURIComponent(cat.split('/wiki/')[1] || '')
      if (!slug || slug === 'Music') continue
      const label = GENRE_LABELS[slug] ?? slug.replace(/_/g, ' ').replace(/ music$/i, '').toLowerCase()
      count.set(label, (count.get(label) ?? 0) + weight)
    }
  })
  return Array.from(count.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([g]) => g)
}

/**
 * Mezcla canciones de los artistas que más escuchas con canciones de tus géneros,
 * sin repetir lo que ya escuchaste.
 */
export async function getForYouVideos(
  recentIds: string[],
  artists: string[],
  genreCount = 2
): Promise<ForYouResult> {
  const genres = genreCount > 0 ? (await detectGenres(recentIds).catch(() => [])).slice(0, genreCount) : []
  const topArtists = artists.slice(0, 3)

  const queries = [
    ...topArtists.map((a) => a),
    ...genres.map((g) => `${g} mejores canciones`),
  ]
  const results = await Promise.allSettled(queries.map((q) => searchMusicVideos(q, undefined, 12)))
  const lists = results.map((r) => (r.status === 'fulfilled' ? r.value.videos : []))

  // Intercalar las listas para que se vean variadas
  const heard = new Set(recentIds)
  const seen = new Set<string>()
  const videos: MusicVideo[] = []
  const longest = Math.max(0, ...lists.map((l) => l.length))
  for (let i = 0; i < longest && videos.length < 36; i++) {
    for (const list of lists) {
      const v = list[i]
      if (!v || heard.has(v.id) || seen.has(v.id)) continue
      seen.add(v.id)
      videos.push(v)
    }
  }

  return { videos, genres, artists: topArtists }
}
