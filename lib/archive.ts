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
  language?: string | string[]
  subject?: string | string[]
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

/** Géneros: colecciones temáticas del archivo y palabras clave del tema (en inglés y español) */
export const ARCHIVE_GENRES: Record<string, { label: string; terms: string }> = {
  comedia: { label: 'Comedia', terms: 'collection:(Comedy_Films) OR subject:(comedy OR comedia OR slapstick)' },
  terror: { label: 'Terror', terms: 'subject:(horror OR terror OR zombie OR vampire OR monster)' },
  scifi: { label: 'Ciencia ficción', terms: 'subject:("science fiction" OR "sci-fi" OR scifi OR "ciencia ficción")' },
  negro: { label: 'Cine negro y crimen', terms: 'collection:(Film_Noir) OR subject:("film noir" OR noir OR crime OR gangster OR detective)' },
  western: { label: 'Western', terms: 'subject:(western OR westerns OR cowboy)' },
  drama: { label: 'Drama', terms: 'subject:(drama OR melodrama)' },
  aventura: { label: 'Aventura y acción', terms: 'subject:(adventure OR aventura OR action OR swashbuckler OR jungle)' },
  romance: { label: 'Romance', terms: 'subject:(romance OR romantic OR romántica)' },
  suspenso: { label: 'Suspenso', terms: 'subject:(mystery OR suspense OR thriller OR misterio)' },
  guerra: { label: 'Guerra', terms: 'subject:(war OR guerra OR "world war")' },
  musical: { label: 'Musicales', terms: 'subject:(musical OR musicals)' },
  animacion: { label: 'Animación', terms: 'collection:(classic_cartoons OR animationandcartoons) OR subject:(animation OR animated OR cartoon OR cartoons OR animación)' },
  mudo: { label: 'Cine mudo', terms: 'collection:(silent_films) OR subject:(silent OR "silent film" OR "cine mudo")' },
  documental: { label: 'Documentales', terms: 'subject:(documentary OR documental OR documentaries)' },
}

/** Dónde buscar: largometrajes y colecciones de cine del archivo (no subidas sueltas de usuarios) */
const FILM_COLLECTIONS =
  'collection:(feature_films OR Film_Noir OR SciFi_Horror OR Comedy_Films OR silent_films OR classic_cartoons OR animationandcartoons OR cinemocracy)'
/** Audio o subtítulos en español */
export const SPANISH = 'language:(spa OR Spanish OR español OR Español OR espanol OR "Spanish; Castilian")'

/** Fuera: contenido para adultos, avances y copias de películas recientes ("rip", "1080p"…) */
const ADULT = '(erotic OR erotica OR erótica OR erotico OR erótico OR sex OR sexo OR sexy OR xxx OR porn OR porno OR adult OR adultos OR nudist OR nudism OR nudista OR hentai OR stag OR sexploitation OR softcore OR desnudo OR desnudos OR desnuda OR desnudas)'
const EXCLUDE = [
  `NOT subject:${ADULT}`,
  `NOT title:${ADULT}`,
  'NOT title:(dvdrip OR brrip OR bdrip OR webrip OR hdrip OR camrip OR "web-dl" OR trailer OR tráiler OR avance)',
  'NOT collection:(movie_trailers OR no-preview)',
  // Copias bajadas de YouTube (casi siempre películas con derechos vigentes)
  'NOT identifier:(y-2-mate* OR yt-1s* OR y2mate*)',
].join(' AND ')
/**
 * En español: cine hasta 1930 (dominio público), lo marcado como dominio público y clásicos con
 * subtítulos en español. Los clásicos en general: hasta 1970 (donde están los de dominio público).
 */
const SPANISH_PD =
  'year:[1890 TO 1977] AND (year:[1890 TO 1930] OR subject:("public domain" OR "dominio público" OR "dominio publico") OR title:("spanish subtitles" OR subtitulada OR "subtítulos en español" OR "subtitulos en español"))'
const CLASSIC_PD = 'year:[1890 TO 1970]'

export interface ArchiveMovieQuery {
  kind: 'es' | 'classic'
  q?: string
  genre?: string
  page?: number
  sort?: 'popular' | 'new' | 'old'
}

/**
 * Películas del archivo. kind "es": en español; "classic": todas.
 * Con q busca por título (y por director o actor); con genre filtra por género.
 */
export async function searchArchiveMovies(kindOrQuery: 'es' | 'classic' | ArchiveMovieQuery, q = '', page = 1): Promise<FreeMovie[]> {
  const opts: ArchiveMovieQuery = typeof kindOrQuery === 'string' ? { kind: kindOrQuery, q, page } : kindOrQuery
  const terms = [FILM_COLLECTIONS, 'mediatype:(movies)', EXCLUDE]
  terms.push(opts.kind === 'es' ? `${SPANISH} AND ${SPANISH_PD}` : CLASSIC_PD)
  const g = opts.genre && ARCHIVE_GENRES[opts.genre]
  if (g) terms.push(`(${g.terms})`)
  const clean = (opts.q || '').replace(/["():*?\[\]{}^~!\\/]/g, ' ').replace(/\b(AND|OR|NOT)\b/g, ' ').replace(/\s+/g, ' ').trim()
  if (clean) terms.push(`(title:(${clean}) OR creator:(${clean}) OR subject:(${clean}))`)
  const params = new URLSearchParams({ q: terms.join(' AND '), rows: '48', page: String(opts.page || 1), output: 'json' })
  for (const f of ['identifier', 'title', 'year', 'description', 'runtime', 'language', 'subject']) params.append('fl[]', f)
  params.append('sort[]', opts.sort === 'new' ? 'year desc' : opts.sort === 'old' ? 'year asc' : 'downloads desc')

  const res = await fetch(`${ARCHIVE}/advancedsearch.php?${params}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CarlosPNautoInteractive/1.0)' },
    next: { revalidate: 86400 },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`Archive ${res.status}`)
  const data = (await res.json()) as { response?: { docs?: Doc[] } }
  return (data.response?.docs ?? []).map((d) => ({
    id: `archive-${d.identifier}`,
    title: first(d.title) || d.identifier,
    poster: `https://archive.org/services/img/${encodeURIComponent(d.identifier)}`,
    summary: plain(first(d.description)).slice(0, 600),
    year: d.year ? String(d.year).slice(0, 4) : undefined,
    duration: minutes(d.runtime),
    genre: genreOf(d.subject),
    // La dirección del MP4 se busca al reproducir (/api/free-movies?archive=ID)
    url: '',
    source: 'archive' as const,
    spanish: isSpanish(d.language),
  }))
}

const isSpanish = (lang?: string | string[]) => (Array.isArray(lang) ? lang : lang ? [lang] : []).some((l) => /^(spa|spanish|espa[ñn]ol)/i.test(l))

/** Primer género reconocible de los temas de la película (para mostrarlo en la ficha) */
function genreOf(subject?: string | string[]): string | undefined {
  const list = (Array.isArray(subject) ? subject : subject ? subject.split(/[;,]/) : []).map((x) => x.trim().toLowerCase())
  const map: [RegExp, string][] = [
    [/horror|terror/, 'Terror'],
    [/science fiction|sci-?fi/, 'Ciencia ficción'],
    [/noir|crime|gangster/, 'Cine negro'],
    [/western/, 'Western'],
    [/comed/, 'Comedia'],
    [/animat|cartoon/, 'Animación'],
    [/documentar/, 'Documental'],
    [/musical/, 'Musical'],
    [/romance|romantic/, 'Romance'],
    [/war\b/, 'Guerra'],
    [/mystery|suspense|thriller/, 'Suspenso'],
    [/adventure|action/, 'Aventura'],
    [/silent/, 'Cine mudo'],
    [/drama/, 'Drama'],
  ]
  for (const [re, label] of map) if (list.some((x) => re.test(x))) return label
  return undefined
}

interface ArchiveFile {
  name: string
  format?: string
  size?: string
  source?: string
}

export interface ArchiveSubtitle {
  label: string
  lang: string
  /** Dirección en la app (se entrega como WebVTT) */
  src: string
}

export interface ArchiveVideo {
  /** Mejor MP4 para ver en línea */
  url: string
  /** MP4 más liviano, para descargar al teléfono */
  download: string
  downloadSize?: number
  subtitles: ArchiveSubtitle[]
}

const fileUrl = (identifier: string, name: string) => `${ARCHIVE}/download/${identifier}/${name.split('/').map(encodeURIComponent).join('/')}`

/** Idioma de un archivo de subtítulos por su nombre ("pelicula.spa.srt", "Spanish.vtt", "_es.srt"…) */
export function subtitleLang(name: string): { lang: string; label: string } {
  const n = name.toLowerCase()
  if (/(^|[._\-\s(\[])(es|spa|esp|spanish|espa[ñn]ol|castellano|latino|lat)([._\-\s)\]]|$)/.test(n)) return { lang: 'es', label: 'Español' }
  if (/(^|[._\-\s(\[])(en|eng|english|ingl[eé]s)([._\-\s)\]]|$)/.test(n)) return { lang: 'en', label: 'Inglés' }
  if (/(^|[._\-\s(\[])(pt|por|portugu[eê]s)([._\-\s)\]]|$)/.test(n)) return { lang: 'pt', label: 'Portugués' }
  if (/(^|[._\-\s(\[])(fr|fre|fra|french|fran[cç]ais)([._\-\s)\]]|$)/.test(n)) return { lang: 'fr', label: 'Francés' }
  return { lang: 'und', label: 'Subtítulos' }
}

/** Video de una película del archivo: el MP4 para ver, uno liviano para descargar y sus subtítulos. */
export async function getArchiveVideo(identifier: string): Promise<ArchiveVideo | null> {
  if (!/^[A-Za-z0-9._-]+$/.test(identifier)) return null
  const res = await fetch(`${ARCHIVE}/metadata/${identifier}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CarlosPNautoInteractive/1.0)' },
    next: { revalidate: 86400 },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) return null
  const data = (await res.json()) as { files?: ArchiveFile[] }
  const files = data.files ?? []
  const mp4 = files.filter((f) => /\.mp4$/i.test(f.name))
  if (mp4.length === 0) return null
  // Para ver: la versión h.264 (buena calidad y liviana), luego la de 512 kb, luego la más grande
  const score = (f: ArchiveFile) => (/h\.264/i.test(f.format || '') ? 3 : /512kb/i.test(f.format || '') ? 2 : 1)
  const watch = [...mp4].sort((a, b) => score(b) - score(a) || Number(b.size || 0) - Number(a.size || 0))[0]
  // Para descargar: la más liviana que se vea bien (512 kb), si no, la de ver
  const light = mp4.find((f) => /512kb/i.test(f.format || '') || /512kb\.mp4$/i.test(f.name)) || [...mp4].sort((a, b) => Number(a.size || 0) - Number(b.size || 0))[0]
  const subs = files
    .filter((f) => /\.(srt|vtt)$/i.test(f.name))
    .map((f) => ({ ...subtitleLang(f.name), src: `/api/free-movies?sub=${encodeURIComponent(identifier)}&file=${encodeURIComponent(f.name)}` }))
    // Primero los en español
    .sort((a, b) => (a.lang === 'es' ? 0 : 1) - (b.lang === 'es' ? 0 : 1))
    .slice(0, 6)
  return {
    url: fileUrl(identifier, watch.name),
    download: fileUrl(identifier, light.name),
    downloadSize: Number(light.size) || undefined,
    subtitles: subs,
  }
}

/** Dirección del mejor MP4 de una película del archivo. */
export async function getArchiveVideoUrl(identifier: string): Promise<string | null> {
  return (await getArchiveVideo(identifier))?.url ?? null
}

/** SRT → WebVTT (lo que entiende el reproductor del navegador) */
export function srtToVtt(text: string): string {
  const body = text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
  return body.startsWith('WEBVTT') ? body : `WEBVTT\n\n${body}`
}

/** Subtítulos de una película del archivo, en WebVTT */
export async function getArchiveSubtitle(identifier: string, file: string): Promise<string | null> {
  if (!/^[A-Za-z0-9._-]+$/.test(identifier) || !/\.(srt|vtt)$/i.test(file) || file.includes('..')) return null
  const res = await fetch(fileUrl(identifier, file), {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CarlosPNautoInteractive/1.0)' },
    next: { revalidate: 86400 },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) return null
  const buf = new Uint8Array(await res.arrayBuffer())
  if (buf.length > 3_000_000) return null
  // Muchos subtítulos en español vienen en Latin-1 (Windows-1252): se detecta si no es UTF-8 válido
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    text = new TextDecoder('windows-1252').decode(buf)
  }
  return srtToVtt(text)
}
