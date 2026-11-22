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
  const get = () =>
    fetch(`${MB}/ws/2/artist/?query=${encodeURIComponent(`artist:"${q}"`)}&fmt=json&limit=5`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      next: { revalidate: 30 * 86400 },
      signal: AbortSignal.timeout(8000),
    })
  let res = await get()
  // MusicBrainz permite una consulta por segundo: si está ocupado se espera y se reintenta
  for (let i = 0; i < 2 && (res.status === 503 || res.status === 429); i++) {
    await new Promise((r) => setTimeout(r, 1200 + Math.random() * 800))
    res = await get()
  }
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

// ===== Historia completa del artista (página propia en la app) =====
// El artículo entero de Wikipedia en texto, por secciones. Las canciones, discos y artistas que
// nombra se marcan para tocarlos dentro de la app (nada se abre afuera).

export type BioPart = string | { k: 'song' | 'album' | 'artist'; v: string }
export interface BioSection {
  title: string
  level: number
  paras: BioPart[][]
}
export interface ArtistArticle {
  title: string
  lang: 'es' | 'en'
  url: string
  image?: string
  description?: string
  sections: BioSection[]
}

// Secciones que no son la historia (referencias, enlaces…)
const SKIP_SECTION = /^(referencias|notas|notas y referencias|enlaces externos|bibliograf[ií]a|v[ée]ase tambi[ée]n|fuentes|references|notes|external links|see also|further reading|sources|citations|footnotes)$/i

function classifyLink(t: string): { k: 'song' | 'album' | 'artist'; v: string } | null {
  const m = t.match(/^(.+?)\s*\(([^)]+)\)$/)
  if (!m) return null
  const kind = m[2].toLowerCase()
  const name = m[1].trim()
  if (name.length < 2) return null
  if (/canci[oó]n|song|sencillo|single/.test(kind)) return { k: 'song', v: name }
  if (/[áa]lbum|disco|\bep\b|recopilatorio|banda sonora|soundtrack/.test(kind)) return { k: 'album', v: name }
  if (/banda|grupo|m[úu]sico|cantante|band|musician|singer|rapero|rapper|cantautor/.test(kind)) return { k: 'artist', v: name }
  return null
}

const STARTS_UPPER = new RegExp('^[\\p{Lu}\\d¿¡]', 'u')
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Marca en un párrafo las canciones («entre comillas» o enlazadas), discos y artistas */
function markParagraph(text: string, known: { k: 'song' | 'album' | 'artist'; v: string }[], knownRe: RegExp | null): BioPart[] {
  type Hit = { start: number; end: number; part: { k: 'song' | 'album' | 'artist'; v: string }; whole: string }
  const hits: Hit[] = []
  // Canciones entre comillas: «La Grange», “Tush”, "Legs" (cortas y con mayúscula, no citas largas)
  const QUOTE = /«([^»]{2,60})»|“([^”]{2,60})”|"([^"\n]{2,60})"/g
  for (const m of Array.from(text.matchAll(QUOTE))) {
    const inner = (m[1] ?? m[2] ?? m[3] ?? '').trim()
    if (!STARTS_UPPER.test(inner) || inner.split(/\s+/).length > 7 || /[.;:]$/.test(inner)) continue
    hits.push({ start: m.index!, end: m.index! + m[0].length, part: { k: 'song', v: inner }, whole: m[0] })
  }
  if (knownRe) {
    for (const m of Array.from(text.matchAll(knownRe))) {
      const found = known.find((x) => x.v.toLowerCase() === m[0].toLowerCase())
      if (found) hits.push({ start: m.index!, end: m.index! + m[0].length, part: found, whole: m[0] })
    }
  }
  hits.sort((a, b) => a.start - b.start || b.end - a.end)
  const parts: BioPart[] = []
  let pos = 0
  for (const h of hits) {
    if (h.start < pos) continue
    if (h.start > pos) parts.push(text.slice(pos, h.start))
    parts.push(h.part.k === 'song' && /^[«“"]/.test(h.whole) ? { k: 'song', v: h.part.v } : { k: h.part.k, v: h.whole.replace(/^[«“"]|[»”"]$/g, '') })
    pos = h.end
  }
  if (pos < text.length) parts.push(text.slice(pos))
  return parts
}

export async function getArtistArticle(name: string): Promise<ArtistArticle | null> {
  const found = await getArtistInfo(name)
  if (!found) return null
  const lang = found.lang
  const q = (extra: Record<string, string>) =>
    `${base(lang)}/w/api.php?${new URLSearchParams({ action: 'query', titles: found.title, redirects: '1', format: 'json', formatversion: '2', origin: '*', ...extra })}`
  const [textRes, linksRes] = await Promise.all([
    wikiJson<{ query?: { pages?: { extract?: string }[] } }>(q({ prop: 'extracts', explaintext: '1', exsectionformat: 'wiki' })),
    wikiJson<{ query?: { pages?: { links?: { title: string }[] }[] } }>(q({ prop: 'links', pllimit: 'max', plnamespace: '0' })).catch(() => null),
  ])
  const raw = textRes.query?.pages?.[0]?.extract
  if (!raw) return null
  const known = (linksRes?.query?.pages?.[0]?.links ?? [])
    .map((l) => classifyLink(l.title))
    .filter((x): x is { k: 'song' | 'album' | 'artist'; v: string } => !!x && x.v.toLowerCase() !== found.title.toLowerCase())
  const uniq = Array.from(new Map(known.map((x) => [x.v.toLowerCase(), x])).values()).sort((a, b) => b.v.length - a.v.length).slice(0, 300)
  const knownRe = uniq.length ? new RegExp(`(?<![\\p{L}\\d])(${uniq.map((x) => escapeRe(x.v)).join('|')})(?![\\p{L}\\d])`, 'giu') : null

  const sections: BioSection[] = []
  let cur: BioSection = { title: '', level: 1, paras: [] }
  let skipping = false
  for (const line of raw.split('\n')) {
    const h = line.match(/^(={2,6})\s*(.+?)\s*\1\s*$/)
    if (h) {
      const level = h[1].length
      if (level === 2) skipping = SKIP_SECTION.test(h[2])
      if (skipping) continue
      if (cur.title || cur.paras.length) sections.push(cur)
      cur = { title: h[2], level, paras: [] }
      continue
    }
    if (skipping) continue
    const t = line.trim()
    if (!t) continue
    cur.paras.push(markParagraph(t, uniq, knownRe))
  }
  if (cur.title || cur.paras.length) sections.push(cur)
  return {
    title: found.title,
    lang,
    url: found.url,
    image: found.image,
    description: found.description,
    sections: sections.filter((s) => s.title || s.paras.length),
  }
}
