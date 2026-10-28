// Internet Archive: películas clásicas de dominio público, completas, gratis y legales.
// Búsqueda con advancedsearch y, al reproducir, se elige el MP4 de cada película.
import type { FreeMovie } from '@/lib/pluto'

const ARCHIVE = process.env.ARCHIVE_BASE || 'https://archive.org'

interface Doc {
  identifier: string
  title?: string | string[]
  year?: string | number
  description?: string | string[]
  runtime?: string
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || ''
const plain = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Minutos a partir de "1:32:10", "92 min", etc. */
function minutes(runtime?: string): number | undefined {
  if (!runtime) return undefined
  const parts = runtime.match(/^(\d+):(\d{2})(?::(\d{2}))?$/)
  if (parts) return parts[3] ? Number(parts[1]) * 60 + Number(parts[2]) : Number(parts[1])
  const n = parseInt(runtime, 10)
  return Number.isFinite(n) ? n : undefined
}

/**
 * Películas del archivo. kind "es": en español; "classic": las más vistas.
 * Con q, busca por título.
 */
export async function searchArchiveMovies(kind: 'es' | 'classic', q = '', page = 1): Promise<FreeMovie[]> {
  const terms = ['collection:(feature_films)', 'mediatype:(movies)']
  if (kind === 'es') terms.push('language:(spa OR Spanish OR español OR Español)')
  const clean = q.replace(/["():*?\[\]{}^~!\\/]/g, ' ').trim()
  if (clean) terms.push(`title:(${clean})`)
  const params = new URLSearchParams({ q: terms.join(' AND '), rows: '48', page: String(page), output: 'json' })
  for (const f of ['identifier', 'title', 'year', 'description', 'runtime']) params.append('fl[]', f)
  params.append('sort[]', 'downloads desc')

  const res = await fetch(`${ARCHIVE}/advancedsearch.php?${params}`, { next: { revalidate: 86400 }, signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`Archive ${res.status}`)
  const data = (await res.json()) as { response?: { docs?: Doc[] } }
  return (data.response?.docs ?? []).map((d) => ({
    id: `archive-${d.identifier}`,
    title: first(d.title) || d.identifier,
    poster: `${ARCHIVE}/services/img/${encodeURIComponent(d.identifier)}`,
    summary: plain(first(d.description)).slice(0, 400),
    year: d.year ? String(d.year).slice(0, 4) : undefined,
    duration: minutes(d.runtime),
    // La dirección del MP4 se busca al reproducir (/api/free-movies?archive=ID)
    url: '',
  }))
}

interface ArchiveFile {
  name: string
  format?: string
  size?: string
  source?: string
}

/** Dirección del mejor MP4 de una película del archivo. */
export async function getArchiveVideoUrl(identifier: string): Promise<string | null> {
  if (!/^[A-Za-z0-9._-]+$/.test(identifier)) return null
  const res = await fetch(`${ARCHIVE}/metadata/${identifier}`, { next: { revalidate: 86400 }, signal: AbortSignal.timeout(15000) })
  if (!res.ok) return null
  const data = (await res.json()) as { files?: ArchiveFile[] }
  const mp4 = (data.files ?? []).filter((f) => /\.mp4$/i.test(f.name))
  if (mp4.length === 0) return null
  // Se prefiere la versión h.264 (buena calidad y liviana), luego la de 512 kb, luego la más grande
  const score = (f: ArchiveFile) => (/h\.264/i.test(f.format || '') ? 3 : /512kb/i.test(f.format || '') ? 2 : 1)
  mp4.sort((a, b) => score(b) - score(a) || Number(b.size || 0) - Number(a.size || 0))
  return `${ARCHIVE}/download/${identifier}/${mp4[0].name.split('/').map(encodeURIComponent).join('/')}`
}
