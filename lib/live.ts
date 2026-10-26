// Radio y TV en vivo.
// - Radio: Radio Browser (radio-browser.info), base de datos abierta de emisoras por internet.
// - TV: iptv-org (github.com/iptv-org/iptv), listas públicas de canales que emiten gratis por internet.
// Solo se devuelven streams HTTPS: la app se sirve por HTTPS y el navegador bloquea audio/video HTTP.

export interface RadioStation {
  id: string
  name: string
  url: string
  favicon: string
  country: string
  countryCode: string
  tags: string
  codec: string
  bitrate: number
}

export interface TvChannel {
  id: string
  name: string
  logo: string
  url: string
  group: string
}

const RADIO_SERVERS = [
  'https://de1.api.radio-browser.info',
  'https://nl1.api.radio-browser.info',
  'https://at1.api.radio-browser.info',
  'https://de2.api.radio-browser.info',
]

async function fetchWithTimeout(url: string, init: RequestInit & { next?: { revalidate: number } }, ms = 8000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

interface RawStation {
  stationuuid: string
  name: string
  url_resolved?: string
  url?: string
  favicon?: string
  country?: string
  countrycode?: string
  tags?: string
  codec?: string
  bitrate?: number
  hls?: number
  lastcheckok?: number
}

async function radioRequest(path: string): Promise<RadioStation[]> {
  let lastError: unknown
  for (const base of RADIO_SERVERS) {
    try {
      const res = await fetchWithTimeout(`${base}${path}`, {
        headers: { 'User-Agent': 'CarlosPNautoInteractive/1.0', Accept: 'application/json' },
        next: { revalidate: 3600 },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const raw = (await res.json()) as RawStation[]
      const seen = new Set<string>()
      return raw
        .map((s) => ({ ...s, stream: (s.url_resolved || s.url || '').trim() }))
        .filter((s) => s.stream.startsWith('https://') && !s.hls && s.lastcheckok !== 0)
        .filter((s) => {
          // Quitar duplicados (misma emisora con varios streams)
          const key = s.name.trim().toLowerCase()
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        .map((s) => ({
          id: s.stationuuid,
          name: s.name.trim(),
          url: s.stream,
          favicon: s.favicon?.startsWith('https://') ? s.favicon : '',
          country: s.country || '',
          countryCode: s.countrycode || '',
          tags: (s.tags || '').split(',').slice(0, 3).join(', '),
          codec: s.codec || '',
          bitrate: s.bitrate || 0,
        }))
    } catch (err) {
      lastError = err
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Radio Browser no disponible')
}

const common = 'hidebroken=true&order=clickcount&reverse=true'

export function getRadiosByCountry(countryCode: string, limit = 80) {
  return radioRequest(`/json/stations/bycountrycodeexact/${encodeURIComponent(countryCode)}?${common}&limit=${limit}`)
}

export function getTopRadios(limit = 80) {
  return radioRequest(`/json/stations/topclick/${limit}?hidebroken=true`)
}

export function searchRadios(query: string, countryCode?: string, limit = 60) {
  const cc = countryCode ? `&countrycode=${encodeURIComponent(countryCode)}` : ''
  return radioRequest(`/json/stations/search?name=${encodeURIComponent(query)}${cc}&${common}&limit=${limit}`)
}

// ===== TV (iptv-org) =====

const IPTV_BASE = 'https://iptv-org.github.io/iptv'

/** Listas disponibles: país (cl, mx, ar…), "spa" = canales en español del mundo, "news" = noticias. */
export function tvPlaylistUrl(list: string): string | null {
  if (/^[a-z]{2}$/.test(list)) return `${IPTV_BASE}/countries/${list}.m3u`
  if (list === 'spa') return `${IPTV_BASE}/languages/spa.m3u`
  if (list === 'news') return `${IPTV_BASE}/categories/news.m3u`
  return null
}

/** Convierte una lista M3U (#EXTINF + URL) en canales. */
export function parseM3U(text: string, limit = 250): TvChannel[] {
  const lines = text.split(/\r?\n/)
  const channels: TvChannel[] = []
  const seen = new Set<string>()
  for (let i = 0; i < lines.length && channels.length < limit; i++) {
    const line = lines[i]
    if (!line.startsWith('#EXTINF')) continue
    // La URL es la siguiente línea que no sea comentario
    let url = ''
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j].trim()
      if (!next) continue
      if (next.startsWith('#')) continue
      url = next
      i = j
      break
    }
    if (!url.startsWith('https://')) continue
    const attr = (name: string) => line.match(new RegExp(`${name}="([^"]*)"`))?.[1] || ''
    const name = line.slice(line.lastIndexOf(',') + 1).trim()
    if (!name || seen.has(url)) continue
    seen.add(url)
    channels.push({
      id: attr('tvg-id') || url,
      name: name.replace(/\s*\[(Not 24\/7|Geo-blocked)\]/gi, '').trim(),
      logo: attr('tvg-logo').startsWith('https://') ? attr('tvg-logo') : '',
      url,
      group: (attr('group-title') || '').split(';')[0],
    })
  }
  return channels
}

export async function getTvChannels(list: string): Promise<TvChannel[]> {
  const url = tvPlaylistUrl(list)
  if (!url) return []
  const res = await fetchWithTimeout(url, { next: { revalidate: 21600 } }, 10000)
  if (!res.ok) return []
  return parseM3U(await res.text())
}

// Países ofrecidos en los selectores (el del usuario se añade si no está)
export const LIVE_COUNTRIES = [
  'CL', 'AR', 'PE', 'BO', 'CO', 'EC', 'VE', 'UY', 'PY', 'MX', 'GT', 'HN', 'SV', 'NI', 'CR', 'PA',
  'CU', 'DO', 'PR', 'ES', 'US', 'BR', 'PT', 'IT', 'FR', 'DE', 'GB', 'CA', 'JP',
]
