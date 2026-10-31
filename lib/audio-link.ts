// Enlaces de audio: un archivo (MP3, M4A, OGG, OPUS, WAV, FLAC, AAC), una lista (.m3u/.pls) o
// una página web que tenga enlaces a esos archivos. Se devuelve la lista de pistas listas para
// el reproductor. Los enlaces http (que el navegador bloquea en una web https) pasan por el
// intermediario de la app.
import { lookup } from 'dns/promises'
import { isIP } from 'net'
import { proxiedUrl } from '@/lib/hls-sign'
import { isFmaUrl, readFmaPage } from '@/lib/fma'

const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|weba)(\?|#|$)/i
const LIST_EXT = /\.(m3u8?|pls)(\?|#|$)/i
const MAX_PAGE = 2 * 1024 * 1024

export interface LinkTrack {
  title: string
  url: string
  /** Dirección para el reproductor (directa si es https; si no, por el intermediario) */
  playUrl: string
  artist?: string
  /** Segundos */
  duration?: number
}

/** Un disco (o la página) de donde salieron las canciones */
export interface LinkAlbum {
  title: string
  artist?: string
  year?: string
  cover?: string
  description?: string
  /** Página de origen */
  source: string
  tracks: LinkTrack[]
}

const ARCHIVE = process.env.ARCHIVE_BASE || 'https://archive.org'

function isPrivate(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase()
    return v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:127.') || v === '::'
  }
  const [a, b] = ip.split('.').map(Number)
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
}

/** Solo direcciones públicas de internet (no la red interna del servidor) */
export async function assertPublic(raw: string): Promise<URL> {
  const u = new URL(raw)
  if (!/^https?:$/.test(u.protocol)) throw new Error('Solo enlaces http o https')
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(u.hostname) && process.env.AUDIO_LINK_ALLOW_PRIVATE !== '1') throw new Error('Dirección no permitida')
  const ips = isIP(u.hostname) ? [u.hostname] : (await lookup(u.hostname, { all: true })).map((r) => r.address)
  // (AUDIO_LINK_ALLOW_PRIVATE solo para pruebas locales)
  if (ips.length === 0 || (ips.some(isPrivate) && process.env.AUDIO_LINK_ALLOW_PRIVATE !== '1')) throw new Error('Dirección no permitida')
  return u
}

const fileTitle = (u: string) => {
  try {
    const name = decodeURIComponent(new URL(u).pathname.split('/').pop() || '')
    return name.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_+]/g, ' ').trim() || 'Audio'
  } catch {
    return 'Audio'
  }
}

const playable = (url: string) => (url.startsWith('https://') ? url : proxiedUrl(url))

const toTrack = (url: string, title?: string): LinkTrack => ({ url, title: (title || '').trim() || fileTitle(url), playUrl: playable(url) })

const decodeHtml = (s: string) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim()

function fromPage(html: string, base: URL): LinkTrack[] {
  const out = new Map<string, LinkTrack>()
  const add = (href: string, title?: string) => {
    try {
      const abs = new URL(href.replace(/&amp;/g, '&'), base).toString()
      if (!AUDIO_EXT.test(abs) || out.has(abs)) return
      out.set(abs, toTrack(abs, title))
    } catch {}
  }
  // <a href="…mp3">Título</a>
  for (const m of Array.from(html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi))) add(m[1], decodeHtml(m[2]).slice(0, 120))
  // <audio src> / <source src> y cualquier dirección suelta que termine en audio
  for (const m of Array.from(html.matchAll(/\bsrc\s*=\s*["']([^"']+)["']/gi))) add(m[1])
  for (const m of Array.from(html.matchAll(/https?:\/\/[^\s"'<>()]+\.(?:mp3|m4a|aac|ogg|opus|flac|wav)(?:\?[^\s"'<>()]*)?/gi))) add(m[0])
  return Array.from(out.values()).slice(0, 200)
}

function fromPlaylist(text: string, base: URL): LinkTrack[] {
  const out: LinkTrack[] = []
  let title = ''
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const ext = line.match(/^#EXTINF:[^,]*,(.*)$/i)
    if (ext) {
      title = ext[1]
      continue
    }
    const pls = line.match(/^File\d+=(.+)$/i)
    const plsTitle = line.match(/^Title\d+=(.+)$/i)
    if (plsTitle) {
      if (out.length) out[out.length - 1].title = plsTitle[1]
      continue
    }
    const target = pls ? pls[1] : line.startsWith('#') ? '' : line
    if (!target) continue
    try {
      out.push(toTrack(new URL(target, base).toString(), title))
    } catch {}
    title = ''
  }
  return out.slice(0, 200)
}

// ===== Internet Archive: el disco completo con su información =====

interface ArchiveFile {
  name: string
  source?: string
  format?: string
  original?: string
  title?: string
  track?: string
  album?: string
  artist?: string
  creator?: string
  length?: string
}

const firstText = (v: unknown): string => (Array.isArray(v) ? firstText(v[0]) : typeof v === 'string' ? v : '')

/** Segundos a partir de "234.5" o "3:54" */
function seconds(v?: string): number | undefined {
  if (!v) return undefined
  const p = v.split(':').map(Number)
  const n = p.length > 1 ? p.reduce((a, b) => a * 60 + b, 0) : Number(v)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined
}

// Formato preferido de cada canción (MP3 primero: liviano y suena en todos los teléfonos)
const FORMAT_RANK: [RegExp, number][] = [
  [/^vbr mp3$/i, 0],
  [/^320kbps mp3$/i, 1],
  [/^256kbps mp3$/i, 2],
  [/mp3/i, 3],
  [/ogg|vorbis|opus/i, 4],
  [/m4a|aac|mpeg4/i, 5],
  [/flac/i, 6],
  [/wav|aiff/i, 7],
]
const formatRank = (f: ArchiveFile) => {
  if (!AUDIO_EXT.test(f.name)) return -1
  for (const [re, rank] of FORMAT_RANK) if (re.test(f.format || '')) return rank
  return 8
}

/** Identificador de archive.org en enlaces /details/ID o /download/ID */
function archiveId(u: URL): string | null {
  if (!/(^|\.)archive\.org$/i.test(u.hostname)) return null
  const m = u.pathname.match(/^\/(?:details|download|embed)\/([^/?#]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

async function readArchive(id: string, source: string): Promise<LinkAlbum[]> {
  const res = await fetch(`${ARCHIVE}/metadata/${encodeURIComponent(id)}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CarlosPNautoInteractive/1.0)' },
    signal: AbortSignal.timeout(12000),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Internet Archive respondió ${res.status}`)
  const data = (await res.json()) as { metadata?: Record<string, unknown>; files?: ArchiveFile[] }
  const meta = data.metadata ?? {}
  // Archivos privados (o un disco solo para préstamo) no se pueden escuchar fuera de archive.org
  const files = (data.files ?? []).filter((f) => String((f as { private?: unknown }).private) !== 'true')
  if (String(meta['access-restricted-item']) === 'true' || (data.files?.length && !files.some((f) => formatRank(f) >= 0)))
    throw new Error('Este disco de Internet Archive está restringido: solo se puede escuchar en archive.org')
  if (!files.length) throw new Error('Ese enlace de Internet Archive no tiene archivos')

  // Cada canción una sola vez, en su mejor formato (los derivados apuntan a su original)
  const best = new Map<string, ArchiveFile>()
  for (const f of files) {
    const rank = formatRank(f)
    if (rank < 0) continue
    const key = (f.source === 'derivative' && f.original) || f.name
    const prev = best.get(key)
    if (!prev || rank < formatRank(prev)) best.set(key, f)
  }
  // Los datos (título, número, disco) suelen estar en el original
  const byName = new Map(files.map((f) => [f.name, f]))
  const info = (f: ArchiveFile): ArchiveFile => {
    const orig = f.original ? byName.get(f.original) : undefined
    return { ...orig, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), name: f.name } as ArchiveFile
  }
  const trackNo = (f: ArchiveFile) => parseInt((f.track || '').split('/')[0], 10) || 9999

  const itemTitle = firstText(meta.title) || id
  const itemArtist = firstText(meta.creator) || firstText(meta.artist) || ''
  const year = (firstText(meta.year) || firstText(meta.date)).slice(0, 4) || undefined
  const description = decodeHtml(firstText(meta.description)).slice(0, 1500) || undefined
  // Carátula: una imagen original que parezca portada; si no, la miniatura del archivo
  const images = files.filter((f) => /\.(jpe?g|png|webp)$/i.test(f.name) && !/thumb|_itemimage|spectrogram/i.test(f.name))
  const coverFile = images.find((f) => /cover|front|folder|portada/i.test(f.name)) || images.find((f) => f.source === 'original')
  const fileUrl = (name: string) => `${ARCHIVE}/download/${encodeURIComponent(id)}/${name.split('/').map(encodeURIComponent).join('/')}`
  const cover = coverFile ? fileUrl(coverFile.name) : `${ARCHIVE}/services/img/${encodeURIComponent(id)}`

  // Un archivo puede traer varios discos: se separan por el disco de cada canción
  const groups = new Map<string, ArchiveFile[]>()
  for (const f of Array.from(best.values()).map(info)) {
    const key = f.album?.trim() || itemTitle
    groups.set(key, [...(groups.get(key) ?? []), f])
  }
  return Array.from(groups.entries()).map(([album, list]) => ({
    title: album,
    artist: list.find((f) => f.artist || f.creator)?.artist || list.find((f) => f.creator)?.creator || itemArtist || undefined,
    year,
    cover,
    description,
    source,
    tracks: list
      .sort((a, b) => trackNo(a) - trackNo(b) || a.name.localeCompare(b.name))
      .slice(0, 300)
      .map((f) => ({
        ...toTrack(fileUrl(f.name), f.title),
        artist: f.artist || f.creator || itemArtist || undefined,
        duration: seconds(f.length),
      })),
  }))
}

export interface ArchiveSummary {
  cover?: string
  tracks: number
  year?: string
  artist?: string
}

/** Datos rápidos de un disco de Internet Archive para la lista de resultados */
export async function archiveSummary(id: string): Promise<ArchiveSummary> {
  const res = await fetch(`${ARCHIVE}/metadata/${encodeURIComponent(id)}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CarlosPNautoInteractive/1.0)' },
    signal: AbortSignal.timeout(10000),
    next: { revalidate: 86400 },
  })
  if (!res.ok) throw new Error(`Internet Archive respondió ${res.status}`)
  const data = (await res.json()) as { metadata?: Record<string, unknown>; files?: ArchiveFile[] }
  const meta = data.metadata ?? {}
  const restricted = String(meta['access-restricted-item']) === 'true'
  const files = restricted ? [] : (data.files ?? []).filter((f) => String((f as { private?: unknown }).private) !== 'true')
  const songs = new Set<string>()
  for (const f of files) if (formatRank(f) >= 0) songs.add((f.source === 'derivative' && f.original) || f.name)
  const images = files.filter((f) => /\.(jpe?g|png|webp)$/i.test(f.name) && !/thumb|_itemimage|spectrogram/i.test(f.name))
  const coverFile = images.find((f) => /cover|front|folder|portada/i.test(f.name)) || images.find((f) => f.source === 'original')
  return {
    // Sin imagen propia no se usa la genérica de Internet Archive (se muestra un disco)
    cover: coverFile ? `https://archive.org/download/${encodeURIComponent(id)}/${coverFile.name.split('/').map(encodeURIComponent).join('/')}` : undefined,
    tracks: songs.size,
    year: (firstText(meta.year) || firstText(meta.date)).slice(0, 4) || undefined,
    artist: firstText(meta.creator) || undefined,
  }
}

const metaTag = (html: string, prop: string) =>
  html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`, 'i'))?.[1] ||
  html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`, 'i'))?.[1]

/** Lee un enlace y devuelve sus canciones agrupadas por disco (o por la página de donde salen) */
export async function readAudioAlbums(raw: string): Promise<LinkAlbum[]> {
  const url = await assertPublic(raw.trim())
  const id = archiveId(url)
  if (id && !AUDIO_EXT.test(url.pathname)) {
    try {
      const albums = await readArchive(id, `https://archive.org/details/${encodeURIComponent(id)}`)
      if (albums.some((a) => a.tracks.length)) return albums.filter((a) => a.tracks.length)
    } catch {}
  }
  // Free Music Archive: canciones con sus datos, agrupadas por disco
  if (isFmaUrl(url)) {
    const fma = await readFmaPage(url.toString())
    if (fma.tracks.length) {
      const groups = new Map<string, typeof fma.tracks>()
      for (const t of fma.tracks) {
        const key = t.album || fma.title || 'Free Music Archive'
        groups.set(key, [...(groups.get(key) ?? []), t])
      }
      const single = groups.size === 1
      return Array.from(groups.entries()).map(([title, list]) => ({
        title: title.replace(/\s*\|\s*Free Music Archive$/i, ''),
        artist: list[0].artist,
        cover: list.find((t) => t.image)?.image || (single ? fma.image : undefined),
        description: single ? fma.description : undefined,
        source: single ? url.toString() : list[0].albumUrl || url.toString(),
        tracks: list.map((t) => ({ ...toTrack(t.url, t.title), artist: t.artist, duration: t.duration })),
      }))
    }
  }
  let page = ''
  const tracks = await readAudioLink(url.toString(), (html) => (page = html))
  if (!tracks.length) return []
  const host = url.hostname.replace(/^www\./, '')
  const title = decodeHtml(metaTag(page, 'og:title') || page.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '') || host
  const image = metaTag(page, 'og:image')
  let cover: string | undefined
  try {
    if (image) cover = new URL(image, url).toString()
  } catch {}
  return [
    {
      title: tracks.length === 1 && !page ? tracks[0].title : title.slice(0, 120),
      artist: decodeHtml(metaTag(page, 'og:site_name') || '') || host,
      cover: cover?.startsWith('https://') ? cover : undefined,
      description: decodeHtml(metaTag(page, 'og:description') || metaTag(page, 'description') || '').slice(0, 1500) || undefined,
      source: url.toString(),
      tracks,
    },
  ]
}

/** Lee un enlace y devuelve las pistas de audio que contiene */
export async function readAudioLink(raw: string, onPage?: (html: string) => void): Promise<LinkTrack[]> {
  let url = await assertPublic(raw.trim())
  if (AUDIO_EXT.test(url.pathname)) return [toTrack(url.toString())]

  // Se siguen las redirecciones a mano para revisar cada destino
  let res: Response | null = null
  for (let i = 0; i < 4; i++) {
    res = await fetch(url, {
      redirect: 'manual',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CarlosPNautoInteractive/1.0)', Accept: 'text/html,audio/*,*/*' },
      signal: AbortSignal.timeout(10000),
      cache: 'no-store',
    })
    const loc = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && loc) {
      url = await assertPublic(new URL(loc, url).toString())
      continue
    }
    break
  }
  if (!res || !res.ok) throw new Error(`La página respondió ${res?.status ?? 'sin respuesta'}`)
  const type = res.headers.get('content-type') || ''
  if (/^audio\//i.test(type) || /octet-stream/i.test(type) && AUDIO_EXT.test(url.pathname)) {
    res.body?.cancel().catch(() => {})
    return [toTrack(url.toString())]
  }

  // Página o lista: se lee como texto (hasta 2 MB)
  const reader = res.body?.getReader()
  let size = 0
  const chunks: Uint8Array[] = []
  while (reader) {
    const { done, value } = await reader.read()
    if (done || !value) break
    chunks.push(value)
    size += value.length
    if (size > MAX_PAGE) {
      reader.cancel().catch(() => {})
      break
    }
  }
  const text = new TextDecoder().decode(Buffer.concat(chunks))
  if (LIST_EXT.test(url.pathname) || /mpegurl|scpls/i.test(type) || /^#EXTM3U|^\[playlist\]/i.test(text.trimStart())) {
    return fromPlaylist(text, url)
  }
  onPage?.(text)
  return fromPage(text, url)
}
