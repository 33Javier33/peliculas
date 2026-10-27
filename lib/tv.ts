// Canales de TV en vivo de un país, combinando varias fuentes públicas:
//  1. Base de datos de iptv-org (channels.json + streams.json): trae la ciudad y la región
//     de cada canal, y si el stream necesita Referer/User-Agent.
//  2. Listas M3U de iptv-org por país.
//  3. Lista curada de Free-TV/IPTV (canales gratuitos y legales por país).
// Los streams http, los que exigen cabeceras y, como respaldo, los que bloquean CORS se
// reproducen a través del intermediario /api/hls (direcciones firmadas).
import { proxiedUrl } from '@/lib/hls-sign'
import type { TvChannel } from '@/lib/live'

// Se pueden cambiar por variables de entorno (p. ej. para pruebas)
const API = process.env.TV_API_BASE || 'https://iptv-org.github.io/api'
const IPTV = process.env.TV_IPTV_BASE || 'https://iptv-org.github.io/iptv'
const FREE_TV = process.env.TV_FREETV_URL || 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8'

interface DbChannel {
  id: string
  name: string
  country: string
  subdivision?: string | null
  city?: string | null
  categories?: string[]
  is_nsfw?: boolean
  closed?: string | null
  logo?: string
}
interface DbStream {
  channel: string | null
  url: string
  referrer?: string | null
  user_agent?: string | null
  quality?: string | null
  title?: string
}
interface DbLogo {
  channel: string
  url: string
}
interface DbSubdivision {
  code: string
  name: string
}

// Los archivos completos pesan varios MB: se guardan en memoria unas horas
const memo = new Map<string, { at: number; data: unknown }>()
async function cachedJson<T>(url: string, ttlMs = 6 * 60 * 60 * 1000): Promise<T> {
  const hit = memo.get(url)
  if (hit && Date.now() - hit.at < ttlMs) return hit.data as T
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20000)
  try {
    const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as T
    memo.set(url, { at: Date.now(), data })
    return data
  } finally {
    clearTimeout(timer)
  }
}

async function cachedText(url: string, ttlMs = 6 * 60 * 60 * 1000): Promise<string> {
  const hit = memo.get(url)
  if (hit && Date.now() - hit.at < ttlMs) return hit.data as string
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15000)
  try {
    const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const text = await res.text()
    memo.set(url, { at: Date.now(), data: text })
    return text
  } finally {
    clearTimeout(timer)
  }
}

export interface RawStream {
  name: string
  url: string
  logo: string
  group: string
  tvgId: string
  referrer?: string
  userAgent?: string
}

/** Lee una lista M3U, incluidas las opciones #EXTVLCOPT de Referer / User-Agent. */
export function parseM3UStreams(text: string): RawStream[] {
  const out: RawStream[] = []
  let info: string | null = null
  let referrer: string | undefined
  let userAgent: string | undefined
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('#EXTINF')) {
      info = line
      referrer = undefined
      userAgent = undefined
      continue
    }
    if (line.startsWith('#EXTVLCOPT:http-referrer=')) referrer = line.split('=').slice(1).join('=')
    else if (line.startsWith('#EXTVLCOPT:http-user-agent=')) userAgent = line.split('=').slice(1).join('=')
    if (line.startsWith('#') || !info) continue
    if (/^https?:\/\//i.test(line)) {
      const attr = (n: string) => info!.match(new RegExp(`${n}="([^"]*)"`))?.[1] || ''
      const name = info.slice(info.lastIndexOf(',') + 1).trim()
      if (name) {
        out.push({
          name,
          url: line,
          logo: attr('tvg-logo'),
          group: (attr('group-title') || '').split(';')[0],
          tvgId: attr('tvg-id'),
          referrer: referrer || attr('http-referrer') || undefined,
          userAgent: userAgent || attr('http-user-agent') || undefined,
        })
      }
    }
    info = null
  }
  return out
}

const cleanName = (n: string) =>
  n
    .replace(/\s*\[(Not 24\/7|Geo-blocked)\]/gi, '')
    .replace(/\s*Ⓖ|\s*Ⓨ|\s*Ⓢ/g, '')
    .replace(/\s*\((\d{3,4}p)\)/gi, '')
    .trim()
const norm = (n: string) => cleanName(n).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')

const CATEGORY_ES: Record<string, string> = {
  news: 'Noticias',
  general: 'General',
  entertainment: 'Entretenimiento',
  sports: 'Deportes',
  music: 'Música',
  kids: 'Infantil',
  religious: 'Religioso',
  culture: 'Cultura',
  education: 'Educación',
  documentary: 'Documentales',
  movies: 'Películas',
  series: 'Series',
  legislative: 'Legislativo',
  local: 'Local',
  lifestyle: 'Estilo de vida',
  comedy: 'Comedia',
  business: 'Negocios',
  shop: 'Compras',
}

/** Construye el canal final con su dirección directa y la del intermediario. */
function toChannel(s: {
  id: string
  name: string
  logo: string
  url: string
  group: string
  city?: string
  region?: string
  referrer?: string
  userAgent?: string
}): TvChannel {
  const headers = { referrer: s.referrer, userAgent: s.userAgent }
  const proxy = proxiedUrl(s.url, headers)
  // Directo solo si es https y no pide cabeceras; si falla (CORS), el reproductor usa el intermediario
  const direct = s.url.startsWith('https://') && !s.referrer && !s.userAgent
  return {
    id: s.id,
    name: cleanName(s.name),
    logo: s.logo.startsWith('https://') ? s.logo : '',
    url: direct ? s.url : proxy,
    fallbackUrl: direct ? proxy : undefined,
    group: s.group,
    city: s.city || undefined,
    region: s.region || undefined,
  }
}

/** Todos los canales nacionales de un país (CL, MX…), con ciudad cuando se conoce. */
export async function getNationalChannels(countryCode: string): Promise<TvChannel[]> {
  const cc = countryCode.toUpperCase()
  const countryEn = (() => {
    try {
      return new Intl.DisplayNames(['en'], { type: 'region' }).of(cc) || cc
    } catch {
      return cc
    }
  })()

  const [channels, streams, logos, subdivisions, countryM3u, freeTv] = await Promise.all([
    cachedJson<DbChannel[]>(`${API}/channels.json`).catch(() => [] as DbChannel[]),
    cachedJson<DbStream[]>(`${API}/streams.json`).catch(() => [] as DbStream[]),
    cachedJson<DbLogo[]>(`${API}/logos.json`).catch(() => [] as DbLogo[]),
    cachedJson<DbSubdivision[]>(`${API}/subdivisions.json`, 7 * 24 * 60 * 60 * 1000).catch(() => [] as DbSubdivision[]),
    cachedText(`${IPTV}/countries/${cc.toLowerCase()}.m3u`).then(parseM3UStreams).catch(() => [] as RawStream[]),
    cachedText(FREE_TV).then(parseM3UStreams).catch(() => [] as RawStream[]),
  ])

  const countryChannels = new Map(
    channels.filter((c) => c.country === cc && !c.is_nsfw && !c.closed).map((c) => [c.id, c])
  )
  const logoOf = new Map<string, string>()
  for (const l of logos) if (!logoOf.has(l.channel)) logoOf.set(l.channel, l.url)
  const regionName = new Map(subdivisions.map((s) => [s.code, s.name]))

  const result = new Map<string, TvChannel>() // por nombre normalizado
  const add = (ch: TvChannel) => {
    const key = norm(ch.name)
    const prev = result.get(key)
    // Se prefiere el que se puede ver directo, y si no, el que trae ciudad
    if (!prev || (!prev.fallbackUrl && ch.fallbackUrl) || (!prev.city && ch.city && !!prev.fallbackUrl === !!ch.fallbackUrl)) {
      result.set(key, { ...ch, city: ch.city || prev?.city, region: ch.region || prev?.region, logo: ch.logo || prev?.logo || '' })
    }
  }

  // 1) Base de datos (con ciudad/región)
  for (const s of streams) {
    const meta = s.channel ? countryChannels.get(s.channel) : undefined
    if (!meta) continue
    add(
      toChannel({
        id: meta.id,
        name: meta.name,
        logo: meta.logo || logoOf.get(meta.id) || '',
        url: s.url,
        group: (meta.categories ?? []).map((c) => CATEGORY_ES[c] || c)[0] || 'General',
        city: meta.city || undefined,
        region: meta.subdivision ? regionName.get(meta.subdivision) || undefined : undefined,
        referrer: s.referrer || undefined,
        userAgent: s.user_agent || undefined,
      })
    )
  }

  // 2) Lista M3U del país
  for (const s of countryM3u) {
    const meta = s.tvgId ? countryChannels.get(s.tvgId.split('@')[0]) : undefined
    add(
      toChannel({
        id: s.tvgId || s.url,
        name: s.name,
        logo: s.logo,
        url: s.url,
        group: s.group || 'General',
        city: meta?.city || undefined,
        region: meta?.subdivision ? regionName.get(meta.subdivision) : undefined,
        referrer: s.referrer,
        userAgent: s.userAgent,
      })
    )
  }

  // 3) Free-TV: el grupo es el nombre del país en inglés
  for (const s of freeTv) {
    if (s.group.toLowerCase() !== countryEn.toLowerCase()) continue
    add(toChannel({ id: s.tvgId || s.url, name: s.name, logo: s.logo, url: s.url, group: 'General', referrer: s.referrer, userAgent: s.userAgent }))
  }

  return Array.from(result.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

/** Listas temáticas (en español, noticias) con la misma lógica de intermediario. */
export async function getThemedChannels(list: 'spa' | 'news' | string): Promise<TvChannel[]> {
  const url =
    list === 'spa'
      ? `${IPTV}/languages/spa.m3u`
      : list === 'news'
        ? `${IPTV}/categories/news.m3u`
        : /^[a-z]{2}-[a-z0-9]{1,3}$/.test(list)
          ? `${IPTV}/subdivisions/${list}.m3u`
          : null
  if (!url) return []
  const streams = await cachedText(url).then(parseM3UStreams).catch(() => [] as RawStream[])
  const seen = new Set<string>()
  const out: TvChannel[] = []
  for (const s of streams) {
    const key = norm(s.name)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(toChannel({ id: s.tvgId || s.url, name: s.name, logo: s.logo, url: s.url, group: s.group || 'General', referrer: s.referrer, userAgent: s.userAgent }))
    if (out.length >= 400) break
  }
  return out
}
