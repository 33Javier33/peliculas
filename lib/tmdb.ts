import type {
  Movie,
  MovieDetails,
  MoviesResponse,
  Credits,
  VideosResponse,
  Video,
} from '@/types/tmdb'

const TMDB_BASE_URL = process.env.TMDB_BASE_URL || 'https://api.themoviedb.org/3'
const TMDB_IMAGE_BASE_URL = process.env.TMDB_IMAGE_BASE_URL || 'https://image.tmdb.org/t/p'

async function tmdbFetch<T>(
  endpoint: string,
  params: Record<string, string> = {},
  revalidateSeconds = 3600
): Promise<T> {
  const apiKey = process.env.TMDB_API_KEY

  if (!apiKey) {
    throw new Error(
      'TMDB_API_KEY no está configurada. Crea un archivo .env.local con tu API key de TMDB.'
    )
  }

  const url = new URL(`${TMDB_BASE_URL}${endpoint}`)
  url.searchParams.set('api_key', apiKey)
  url.searchParams.set('language', 'es-ES')

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }

  const response = await fetch(url.toString(), {
    next: { revalidate: revalidateSeconds },
  })

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Recurso no encontrado: ${endpoint}`)
    }
    if (response.status === 401) {
      throw new Error('API Key de TMDB inválida o no autorizada.')
    }
    throw new Error(
      `Error de TMDB API: ${response.status} ${response.statusText} en ${endpoint}`
    )
  }

  return response.json() as Promise<T>
}

export async function getPopularMovies(page = 1): Promise<MoviesResponse> {
  return tmdbFetch<MoviesResponse>('/movie/popular', { page: String(page) })
}

export async function getTrendingMovies(): Promise<MoviesResponse> {
  return tmdbFetch<MoviesResponse>('/trending/movie/week', {}, 1800)
}

export async function searchMovies(query: string, page = 1): Promise<MoviesResponse> {
  if (!query.trim()) {
    return { page: 1, results: [], total_pages: 0, total_results: 0 }
  }
  return tmdbFetch<MoviesResponse>(
    '/search/movie',
    { query: query.trim(), page: String(page), include_adult: 'false' },
    300
  )
}

export async function getMovieDetails(id: string | number): Promise<MovieDetails> {
  return tmdbFetch<MovieDetails>(`/movie/${id}`, {}, 86400)
}

export async function getMovieVideos(id: string | number): Promise<VideosResponse> {
  return tmdbFetch<VideosResponse>(`/movie/${id}/videos`, {}, 86400)
}

export async function getMovieCredits(id: string | number): Promise<Credits> {
  return tmdbFetch<Credits>(`/movie/${id}/credits`, {}, 86400)
}

export function getYouTubeTrailerId(videos: Video[]): string | null {
  const officialTrailer = videos.find(
    (v) => v.type === 'Trailer' && v.site === 'YouTube' && v.official
  )
  if (officialTrailer) return officialTrailer.key

  const anyTrailer = videos.find((v) => v.type === 'Trailer' && v.site === 'YouTube')
  if (anyTrailer) return anyTrailer.key

  const teaser = videos.find((v) => v.type === 'Teaser' && v.site === 'YouTube')
  if (teaser) return teaser.key

  const anyYouTube = videos.find((v) => v.site === 'YouTube')
  return anyYouTube ? anyYouTube.key : null
}

export function getPosterUrl(path: string | null, size = 'w500'): string | null {
  if (!path) return null
  return `${TMDB_IMAGE_BASE_URL}/${size}${path}`
}

export function getBackdropUrl(path: string | null, size = 'original'): string | null {
  if (!path) return null
  return `${TMDB_IMAGE_BASE_URL}/${size}${path}`
}

export function getProfileUrl(path: string | null, size = 'w185'): string | null {
  if (!path) return null
  return `${TMDB_IMAGE_BASE_URL}/${size}${path}`
}

export function formatRating(rating: number): string {
  return rating.toFixed(1)
}

export function formatYear(dateString: string | undefined | null): string {
  if (!dateString) return 'N/A'
  const year = new Date(dateString).getFullYear()
  return isNaN(year) ? 'N/A' : String(year)
}

export function formatRuntime(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return 'N/A'
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours === 0) return `${mins}m`
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}m`
}

export function formatCurrency(amount: number): string {
  if (!amount || amount === 0) return 'N/A'
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}
