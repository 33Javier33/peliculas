// Buscador de música de Internet Archive (archive.org): discos, conciertos y grabaciones
// que la biblioteca ofrece para escuchar. Cada resultado se abre con /api/audio-link.
const ARCHIVE = process.env.ARCHIVE_BASE || 'https://archive.org'

export interface ArchiveAudioResult {
  id: string
  title: string
  /** Búsqueda por canción: el nombre de la canción (el disco empieza por ella) */
  song?: string
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
export type ArchiveSearchBy = 'all' | 'artist' | 'album' | 'exactArtist' | 'song'

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

/**
 * Autocompletado de archive.org: artistas y discos que empiezan como lo escrito (los más
 * escuchados primero). scope "free": solo la música libre (Jamendo, FMA, sellos independientes).
 */
export async function suggestArchiveAudio(q: string, scope: ArchiveScope = 'all'): Promise<string[]> {
  const words = clean(q).replace(/\b(AND|OR|NOT)\b/g, ' ').split(' ').filter(Boolean).slice(0, 5)
  if (!words.length) return []
  // Todas las palabras; la última, a medio escribir (ste → stereo)
  const expr = words.map((w, i) => (i === words.length - 1 && w.length >= 2 ? `${w}*` : w)).join(' AND ')
  const params = new URLSearchParams({
    q: [`(creator:(${expr}) OR title:(${expr}))`, ...scopeTerms(scope), 'mediatype:(audio)', 'NOT collection:(podcasts OR radioprograms OR audio_podcast)'].join(' AND '),
    rows: '50',
    output: 'json',
  })
  params.append('fl[]', 'creator')
  params.append('fl[]', 'title')
  params.append('sort[]', 'downloads desc')
  const res = await fetch(`${ARCHIVE}/advancedsearch.php?${params}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CarlosPNautoInteractive/1.0)' },
    next: { revalidate: 86400 },
    signal: AbortSignal.timeout(6000),
  })
  if (!res.ok) throw new Error(`Internet Archive respondió ${res.status}`)
  const docs = ((await res.json()) as { response?: { docs?: Doc[] } }).response?.docs ?? []
  return rankSuggestions(q, docs.flatMap((d) => [first(d.creator), first(d.title)]))
}

/** Solo lo que coincide con lo escrito: primero lo que empieza igual, sin repetidos ni textos larguísimos */
export function rankSuggestions(q: string, list: string[]): string[] {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const words = norm(q).split(/\s+/).filter(Boolean)
  const seen = new Set<string>()
  const ok = list
    .map((s) => s.replace(/\s+/g, ' ').replace(/[\s,;:.\-–—_]+$/, '').trim())
    .filter((s) => s.length > 1 && s.length <= 70 && !/^\d+$/.test(s))
    .filter((s) => {
      const n = norm(s)
      if (seen.has(n)) return false
      seen.add(n)
      return words.every((w) => n.includes(w))
    })
  // Primero lo que empieza igual y, entre eso, lo más corto (el nombre del artista antes que sus conciertos)
  const starts = ok.filter((s) => norm(s).startsWith(words.join(' '))).sort((a, b) => a.length - b.length)
  return [...starts, ...ok.filter((s) => !starts.includes(s))].slice(0, 8)
}

const DEEZER = process.env.DEEZER_API_BASE || 'https://api.deezer.com'

/**
 * Buscar por canción. archive.org no busca dentro de los discos (solo su ficha), así que:
 *  1. se busca la canción en el catálogo de Deezer (qué artista y qué disco la tienen),
 *  2. se buscan esos discos de esos artistas en archive.org,
 *  3. y los discos cuyo título es la canción (sencillos, discos de 78 rpm).
 * Cada resultado lleva el nombre de la canción: al tocarlo, el disco empieza por ella.
 */
export async function searchArchiveSongs(q: string, scope: ArchiveScope = 'all'): Promise<{ results: ArchiveAudioResult[]; total: number }> {
  const text = clean(q).replace(/\b(AND|OR|NOT)\b/g, ' ').trim()
  if (!text) return { results: [], total: 0 }
  const dz = await fetch(`${DEEZER}/search?${new URLSearchParams({ q: text, limit: '25' })}`, { next: { revalidate: 86400 }, signal: AbortSignal.timeout(6000) })
    .then((r) => (r.ok ? r.json() : { data: [] }))
    .catch(() => ({ data: [] })) as { data?: { title?: string; artist?: { name?: string }; album?: { title?: string } }[] }
  // Cada disco una vez (el mismo tema sale en varias ediciones)
  const pairs: { song: string; artist: string; album: string }[] = []
  const seen = new Set<string>()
  for (const t of dz.data ?? []) {
    const song = t.title?.trim()
    const artist = t.artist?.name?.trim()
    const album = t.album?.title?.replace(/\s*\((?:remaster|deluxe|expanded|edición)[^)]*\)/gi, '').trim()
    if (!song || !artist || !album) continue
    const key = `${artist}|${album}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    pairs.push({ song, artist, album })
    if (pairs.length >= 6) break
  }
  const lists = await Promise.all([
    ...pairs.map((p) =>
      // El artista en cualquier campo: muchos discos subidos no llenan "creador" (lo ponen en el título o la descripción)
      query([`title:(${clean(p.album)})`, `(creator:(${clean(p.artist)}) OR title:(${clean(p.artist)}) OR subject:(${clean(p.artist)}) OR description:(${clean(p.artist)}))`, ...scopeTerms(scope)], 3, 1)
        .then((r) => r.results.map((x) => ({ ...x, song: p.song })))
        .catch(() => [] as ArchiveAudioResult[])
    ),
    // Discos cuyo título es la canción (sencillos y 78 rpm)
    query([`title:(${text})`, ...scopeTerms(scope)], 12, 1)
      .then((r) => r.results.map((x) => ({ ...x, song: text })))
      .catch(() => [] as ArchiveAudioResult[]),
  ])
  const ids = new Set<string>()
  const results = lists.flat().filter((r) => !ids.has(r.id) && ids.add(r.id))
  return { results, total: results.length }
}
