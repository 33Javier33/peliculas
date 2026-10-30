// Buscador de música de Internet Archive (archive.org): discos, conciertos y grabaciones
// que la biblioteca ofrece para escuchar. Cada resultado se abre con /api/audio-link.
const ARCHIVE = process.env.ARCHIVE_BASE || 'https://archive.org'

export interface ArchiveAudioResult {
  id: string
  title: string
  artist?: string
  year?: string
  cover: string
  /** Página del disco (se le pasa a /api/audio-link) */
  url: string
  downloads?: number
}

interface Doc {
  identifier: string
  title?: string | string[]
  creator?: string | string[]
  year?: string | number
  date?: string
  downloads?: number
}

const first = (v: unknown): string => (Array.isArray(v) ? first(v[0]) : v == null ? '' : String(v))

/**
 * Música libre: las copias que Internet Archive guarda de Jamendo, de Free Music Archive y de
 * cientos de sellos independientes (netlabels), todo con licencias Creative Commons.
 */
export const FREE_MUSIC = 'collection:(jamendo-albums OR netlabels OR freemusicarchive OR fma_full)'
export type ArchiveScope = 'all' | 'free'
const scopeTerms = (scope: ArchiveScope) => (scope === 'free' ? [FREE_MUSIC] : [])

/** Qué buscar: en todo, solo nombres de artista, solo nombres de disco, o un artista exacto */
export type ArchiveSearchBy = 'all' | 'artist' | 'album' | 'exactArtist'

const clean = (q: string) => q.replace(/["():*?\[\]{}^~!\\/]/g, ' ').replace(/\s+/g, ' ').trim()

async function query(terms: string[], rows: number, page: number, sort = 'downloads desc') {
  const params = new URLSearchParams({
    q: [...terms, 'mediatype:(audio)', 'NOT collection:(podcasts OR radioprograms OR audio_podcast)'].join(' AND '),
    rows: String(rows),
    page: String(page),
    output: 'json',
  })
  for (const f of ['identifier', 'title', 'creator', 'year', 'date', 'downloads']) params.append('fl[]', f)
  params.append('sort[]', sort)
  const res = await fetch(`${ARCHIVE}/advancedsearch.php?${params}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CarlosPNautoInteractive/1.0)' },
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(12000),
  })
  if (!res.ok) throw new Error(`Internet Archive respondió ${res.status}`)
  const data = (await res.json()) as { response?: { numFound?: number; docs?: Doc[] } }
  const results: ArchiveAudioResult[] = (data.response?.docs ?? [])
    .filter((d) => d.identifier)
    .map((d) => ({
      id: d.identifier,
      title: first(d.title) || d.identifier,
      artist: first(d.creator) || undefined,
      year: (first(d.year) || first(d.date)).slice(0, 4) || undefined,
      cover: `https://archive.org/services/img/${encodeURIComponent(d.identifier)}`,
      url: `https://archive.org/details/${encodeURIComponent(d.identifier)}`,
      downloads: d.downloads,
    }))
  return { results, total: data.response?.numFound ?? results.length }
}

export async function searchArchiveAudio(
  q: string,
  page = 1,
  collection = '',
  by: ArchiveSearchBy = 'all',
  scope: ArchiveScope = 'all'
): Promise<{ results: ArchiveAudioResult[]; total: number }> {
  const text = clean(q)
  const coll = collection.replace(/[^a-z0-9_-]/gi, '')
  // En música libre, sin texto se muestran los discos más escuchados
  if (!text && !coll && scope !== 'free') return { results: [], total: 0 }
  const field =
    by === 'artist'
      ? `creator:(${text})`
      : by === 'album'
        ? `title:(${text})`
        : by === 'exactArtist'
          ? `creator:("${text}")`
          : `(title:(${text}) OR creator:(${text}) OR subject:(${text}))`
  const terms = [...(text ? [field] : []), ...(coll ? [`collection:(${coll})`] : []), ...scopeTerms(scope)]
  return query(terms, 30, page)
}

export interface ArchiveArtist {
  name: string
  /** Discos y grabaciones suyas entre los resultados */
  count: number
  cover: string
}

/** Artistas cuyo nombre coincide con la búsqueda (agrupando sus discos) */
export async function searchArchiveArtists(q: string, scope: ArchiveScope = 'all'): Promise<ArchiveArtist[]> {
  const text = clean(q)
  if (!text) return []
  const { results } = await query([`creator:(${text})`, ...scopeTerms(scope)], 200, 1)
  const groups = new Map<string, { name: string; count: number; downloads: number; cover: string }>()
  for (const r of results) {
    if (!r.artist) continue
    const key = r.artist.trim().toLowerCase()
    const g = groups.get(key)
    if (g) {
      g.count++
      g.downloads += r.downloads ?? 0
    } else groups.set(key, { name: r.artist.trim(), count: 1, downloads: r.downloads ?? 0, cover: r.cover })
  }
  return Array.from(groups.values())
    .sort((a, b) => b.downloads - a.downloads || b.count - a.count)
    .slice(0, 40)
    .map(({ name, count, cover }) => ({ name, count, cover }))
}
