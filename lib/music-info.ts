// Información de artistas y discos desde Wikipedia (español y, si no hay, inglés).
// Sin clave. Se comprueba que el artículo sea del artista o disco correcto antes de mostrarlo.

const WIKI = process.env.WIKI_BASE || 'https://{lang}.wikipedia.org'
const UA = 'CarlosPNautoInteractive/1.0 (https://peliculas-neon.vercel.app)'

export interface WikiSummary {
  title: string
  extract: string
  description?: string
  image?: string
  url: string
  lang: 'es' | 'en'
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const base = (lang: string) => WIKI.replace('{lang}', lang)

async function wikiJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Api-User-Agent': UA, Accept: 'application/json' },
    next: { revalidate: 7 * 86400 },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`Wikipedia ${res.status}`)
  return (await res.json()) as T
}

async function search(lang: 'es' | 'en', q: string): Promise<string[]> {
  const params = new URLSearchParams({ action: 'query', list: 'search', srsearch: q, srlimit: '5', format: 'json', origin: '*' })
  const d = await wikiJson<{ query?: { search?: { title: string }[] } }>(`${base(lang)}/w/api.php?${params}`)
  return (d.query?.search ?? []).map((r) => r.title)
}

async function summary(lang: 'es' | 'en', title: string): Promise<WikiSummary | null> {
  const d = await wikiJson<{
    type?: string
    title: string
    extract?: string
    description?: string
    thumbnail?: { source?: string }
    content_urls?: { desktop?: { page?: string } }
  }>(`${base(lang)}/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`)
  if (!d.extract || d.type === 'disambiguation') return null
  return {
    title: d.title,
    extract: d.extract,
    description: d.description,
    image: d.thumbnail?.source,
    url: d.content_urls?.desktop?.page || `${base(lang)}/wiki/${encodeURIComponent(title)}`,
    lang,
  }
}

const MUSIC = /cantante|banda|grupo|music|músic|rapero|rapera|compositor|cantautor|dj|duo|dúo|orquesta|singer|band|rapper|songwriter|musician|group|producer|productor/i
const RECORD = /album|álbum|disco|ep|sencillo|single|record|recopilatorio|mixtape|banda sonora|soundtrack/i

/** Último error (para la página de diagnóstico) */
export let lastWikiError = ''

async function find(
  queries: [lang: 'es' | 'en', q: string][],
  accept: (title: string, s: WikiSummary) => boolean
): Promise<WikiSummary | null> {
  for (const [lang, q] of queries) {
    try {
      const titles = await search(lang, q)
      for (const t of titles.slice(0, 4)) {
        const s = await summary(lang, t).catch((err) => {
          lastWikiError = `${lang}: ${(err as Error).message}`
          return null
        })
        if (s && accept(t, s)) return s
      }
    } catch (err) {
      lastWikiError = `${lang}: ${(err as Error).message}`
    }
  }
  return null
}

/** Biografía corta del artista o grupo */
export function getArtistInfo(name: string): Promise<WikiSummary | null> {
  const n = norm(name)
  return find(
    [
      ['es', name],
      ['es', `${name} cantante`],
      ['en', name],
    ],
    (t, s) => norm(t).includes(n) && MUSIC.test(`${s.description ?? ''} ${s.extract.slice(0, 600)}`)
  )
}

/** Reseña del disco (álbum, EP o sencillo) */
export function getAlbumInfo(title: string, artist: string): Promise<WikiSummary | null> {
  const t0 = norm(title)
  const a = norm(artist)
  return find(
    [
      ['es', `${title} ${artist} álbum`],
      ['en', `${title} ${artist} album`],
    ],
    (t, s) => {
      const text = norm(`${s.description ?? ''} ${s.extract}`)
      return norm(t).includes(t0) && text.includes(a) && RECORD.test(`${s.description ?? ''} ${s.extract.slice(0, 300)}`)
    }
  )
}

// ===== MusicBrainz: datos del artista (país, origen, años, tipo y géneros), sin clave =====
const MB = process.env.MUSICBRAINZ_BASE || 'https://musicbrainz.org'

export interface ArtistFacts {
  /** Grupo, Solista, Orquesta, Coro… */
  type?: string
  country?: string
  /** Ciudad o región de origen */
  area?: string
  /** Año de inicio (o de nacimiento) */
  begin?: string
  /** Año de término (o de fallecimiento) */
  end?: string
  genres: string[]
  /** Aclaración ("cantante mexicana", "banda de rock de Seattle"…) */
  note?: string
}

const TYPE_ES: Record<string, string> = { Group: 'Grupo', Person: 'Solista', Orchestra: 'Orquesta', Choir: 'Coro', Character: 'Personaje', Other: 'Otro' }

function countryName(code?: string) {
  if (!code) return undefined
  try {
    return new Intl.DisplayNames(['es'], { type: 'region' }).of(code) || code
  } catch {
    return code
  }
}

interface MbArtist {
  name: string
  score?: number
  type?: string
  country?: string
  disambiguation?: string
  area?: { name?: string }
  'begin-area'?: { name?: string }
  'life-span'?: { begin?: string; end?: string }
  tags?: { name: string; count?: number }[]
}

export async function getArtistFacts(name: string): Promise<ArtistFacts | null> {
  const q = name.replace(/["\\]/g, ' ').trim()
  if (!q) return null
  const res = await fetch(`${MB}/ws/2/artist/?query=${encodeURIComponent(`artist:"${q}"`)}&fmt=json&limit=5`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    next: { revalidate: 30 * 86400 },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`MusicBrainz ${res.status}`)
  const d = (await res.json()) as { artists?: MbArtist[] }
  const n = norm(name)
  // Solo si el nombre coincide de verdad (no un artista parecido)
  const a = (d.artists ?? []).find((x) => (x.score ?? 0) >= 90 && norm(x.name) === n)
  if (!a) return null
  const genres = (a.tags ?? [])
    .filter((t) => (t.count ?? 0) > 0)
    .sort((x, y) => (y.count ?? 0) - (x.count ?? 0))
    .slice(0, 5)
    .map((t) => t.name)
  const facts: ArtistFacts = {
    type: a.type ? TYPE_ES[a.type] || a.type : undefined,
    country: countryName(a.country),
    area: a['begin-area']?.name || (a.area?.name && a.area.name !== countryName(a.country) ? a.area.name : undefined),
    begin: a['life-span']?.begin?.slice(0, 4),
    end: a['life-span']?.end?.slice(0, 4),
    genres,
    note: a.disambiguation || undefined,
  }
  return facts.type || facts.country || facts.begin || genres.length ? facts : null
}
