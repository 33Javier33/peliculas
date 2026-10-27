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

interface Candidate {
  id: string
  name: string
  logo: string
  url: string
  group: string
  city?: string
  region?: string
  referrer?: string
  userAgent?: string
}

// ===== Comprobación de que el canal emite =====
// Un canal suele tener varias direcciones y muchas ya no funcionan: se elige una que
// responda. Nunca se descarta un canal: el servidor está fuera de Chile y muchos canales
// solo emiten para su país, así que "no responde desde aquí" no significa que no funcione.
type Health = 'ok' | 'dead' | 'unknown'
const healthMemo = new Map<string, { at: number; h: Health }>()
const HEALTH_TTL = 60 * 60 * 1000

async function checkStream(c: Candidate): Promise<Health> {
  const hit = healthMemo.get(c.url)
  if (hit && Date.now() - hit.at < HEALTH_TTL) return hit.h
  let h: Health = 'dead'
  try {
    const res = await fetch(c.url, {
      headers: {
        'User-Agent': c.userAgent || 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
        ...(c.referrer ? { Referer: c.referrer } : {}),
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    })
    if (res.ok) h = (await res.text()).slice(0, 2048).includes('#EXTM3U') ? 'ok' : 'dead'
    // Bloqueado por país o por origen: desde Chile puede funcionar, se deja (al final de la preferencia)
    else if ([401, 403, 451].includes(res.status)) h = 'unknown'
  } catch {
    h = 'dead'
  }
  healthMemo.set(c.url, { at: Date.now(), h })
  return h
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i])
      }
    })
  )
  return out
}

/**
 * De cada canal (varias direcciones posibles) usa la primera que emite; si ninguna
 * responde desde el servidor, igual se muestra con la primera. Solo se comprueban los
 * canales con más de una dirección, y con tiempo límite.
 */
async function pickWorking(groups: Candidate[][], budgetMs = 10000): Promise<TvChannel[]> {
  const deadline = Date.now() + budgetMs
  return mapLimit(groups, 24, async (group) => {
    if (group.length === 1) return toChannel(group[0])
    let fallback: Candidate | null = null
    for (const c of group) {
      if (Date.now() > deadline) break
      const h = await checkStream(c)
      if (h === 'ok') return toChannel(c)
      if (h === 'unknown' && !fallback) fallback = c
    }
    return toChannel(fallback ?? group[0])
  })
}

/** Construye el canal final con su dirección directa y la del intermediario. */
function toChannel(s: Candidate): TvChannel {
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

  // Todas las direcciones de cada canal (por nombre), de todas las fuentes
  const byName = new Map<string, Candidate[]>()
  const add = (c: Candidate) => {
    const key = norm(c.name)
    const list = byName.get(key) ?? []
    list.push(c)
    byName.set(key, list)
  }

  // 1) Base de datos (con ciudad/región)
  for (const s of streams) {
    const meta = s.channel ? countryChannels.get(s.channel) : undefined
    if (!meta) continue
    add({
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
  }

  // 2) Lista M3U del país
  for (const s of countryM3u) {
    const meta = s.tvgId ? countryChannels.get(s.tvgId.split('@')[0]) : undefined
    add({
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
  }

  // 3) Free-TV: el grupo es el nombre del país en inglés
  for (const s of freeTv) {
    if (s.group.toLowerCase() !== countryEn.toLowerCase()) continue
    add({ id: s.tvgId || s.url, name: s.name, logo: s.logo, url: s.url, group: 'General', referrer: s.referrer, userAgent: s.userAgent })
  }

  const groups = Array.from(byName.values()).map((list) => {
    // Sin repetir direcciones; primero las que se ven directo (sin intermediario)
    const unique = list.filter((c, i) => list.findIndex((o) => o.url === c.url) === i)
    const directScore = (c: Candidate) => (c.url.startsWith('https://') && !c.referrer && !c.userAgent ? 0 : 1)
    unique.sort((a, b) => directScore(a) - directScore(b))
    // Ciudad, región y logo del que los tenga
    const city = list.find((c) => c.city)?.city
    const region = list.find((c) => c.region)?.region
    const logo = list.find((c) => c.logo.startsWith('https://'))?.logo || ''
    return unique.map((c) => ({ ...c, city: c.city || city, region: c.region || region, logo: c.logo.startsWith('https://') ? c.logo : logo }))
  })

  const working = await pickWorking(groups)
  return working.sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }))
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
  const byName = new Map<string, Candidate[]>()
  for (const s of streams) {
    const key = norm(s.name)
    if (!byName.has(key) && byName.size >= 400) continue
    const list = byName.get(key) ?? []
    list.push({ id: s.tvgId || s.url, name: s.name, logo: s.logo, url: s.url, group: s.group || 'General', referrer: s.referrer, userAgent: s.userAgent })
    byName.set(key, list)
  }
  return pickWorking(Array.from(byName.values()))
}
