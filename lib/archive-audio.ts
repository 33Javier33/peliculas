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

export async function searchArchiveAudio(q: string, page = 1, collection = ''): Promise<{ results: ArchiveAudioResult[]; total: number }> {
  const clean = q.replace(/["():*?\[\]{}^~!\\/]/g, ' ').replace(/\s+/g, ' ').trim()
  const coll = collection.replace(/[^a-z0-9_-]/gi, '')
  if (!clean && !coll) return { results: [], total: 0 }
  // Por título o por artista; solo audio (sin podcasts ni radio grabada)
  const terms = [
    ...(clean ? [`(title:(${clean}) OR creator:(${clean}) OR subject:(${clean}))`] : []),
    ...(coll ? [`collection:(${coll})`] : []),
    'mediatype:(audio)',
    'NOT collection:(podcasts OR radioprograms OR audio_podcast)',
  ]
  const params = new URLSearchParams({ q: terms.join(' AND '), rows: '30', page: String(page), output: 'json' })
  for (const f of ['identifier', 'title', 'creator', 'year', 'date', 'downloads']) params.append('fl[]', f)
  params.append('sort[]', 'downloads desc')
  const res = await fetch(`${ARCHIVE}/advancedsearch.php?${params}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CarlosPNautoInteractive/1.0)' },
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(12000),
  })
  if (!res.ok) throw new Error(`Internet Archive respondió ${res.status}`)
  const data = (await res.json()) as { response?: { numFound?: number; docs?: Doc[] } }
  const results = (data.response?.docs ?? [])
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
