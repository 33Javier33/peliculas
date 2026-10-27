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
  city?: string
  // Solo en "Cerca de mí": distancia aproximada en km
  distanceKm?: number
  lat?: number
  lon?: number
}

export interface TvChannel {
  id: string
  name: string
  logo: string
  // Dirección para reproducir (directa o por el intermediario /api/hls)
  url: string
  // Si la directa falla (p. ej. bloqueo CORS), esta pasa por el intermediario
  fallbackUrl?: string
  group: string
  city?: string
  region?: string
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
  state?: string
  geo_lat?: number | null
  geo_long?: number | null
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
          city: s.state || undefined,
          lat: typeof s.geo_lat === 'number' ? s.geo_lat : undefined,
          lon: typeof s.geo_long === 'number' ? s.geo_long : undefined,
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

/** Busca por nombre de emisora y también por ciudad/región (campo "state" de Radio Browser). */
export async function searchRadios(query: string, countryCode?: string, limit = 60) {
  const cc = countryCode ? `&countrycode=${encodeURIComponent(countryCode)}` : ''
  const q = encodeURIComponent(query)
  const [byName, byCity] = await Promise.allSettled([
    radioRequest(`/json/stations/search?name=${q}${cc}&${common}&limit=${limit}`),
    radioRequest(`/json/stations/search?state=${q}${cc}&${common}&limit=${limit}`),
  ])
  if (byName.status === 'rejected' && byCity.status === 'rejected') throw byName.reason
  const seen = new Set<string>()
  return [
    ...(byCity.status === 'fulfilled' ? byCity.value : []),
    ...(byName.status === 'fulfilled' ? byName.value : []),
  ].filter((s) => !seen.has(s.id) && seen.add(s.id))
}

export function getRadiosByCity(city: string, countryCode: string, limit = 80) {
  return radioRequest(
    `/json/stations/search?state=${encodeURIComponent(city)}&countrycode=${encodeURIComponent(countryCode)}&${common}&limit=${limit}`
  )
}

/** Ciudades/regiones con emisoras en un país (de más a menos emisoras). */
export async function getRadioCities(countryCode: string): Promise<{ name: string; count: number }[]> {
  // Radio Browser agrupa las regiones por el nombre del país en inglés
  let countryName = countryCode
  try {
    countryName = new Intl.DisplayNames(['en'], { type: 'region' }).of(countryCode) || countryCode
  } catch {}
  for (const base of RADIO_SERVERS) {
    try {
      const res = await fetchWithTimeout(`${base}/json/states/${encodeURIComponent(countryName)}/?hidebroken=true`, {
        headers: { 'User-Agent': 'CarlosPNautoInteractive/1.0', Accept: 'application/json' },
        next: { revalidate: 86400 },
      })
      if (!res.ok) continue
      const raw = (await res.json()) as { name: string; stationcount: number }[]
      const merged = new Map<string, number>()
      for (const r of raw) {
        const name = r.name?.trim()
        if (!name || !r.stationcount) continue
        merged.set(name, (merged.get(name) ?? 0) + r.stationcount)
      }
      return Array.from(merged, ([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 80)
    } catch {}
  }
  return []
}

/** Distancia en km entre dos puntos (fórmula del semiverseno). */
function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const rad = Math.PI / 180
  const dLat = (lat2 - lat1) * rad
  const dLon = (lon2 - lon1) * rad
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(a))
}

/**
 * Emisoras cerca de un punto, de la más cercana a la más lejana. Se busca primero en
 * 60 km y, si hay pocas, se amplía el radio. Si se conoce la ciudad, se suman las
 * emisoras registradas en ella aunque no tengan coordenadas.
 */
export async function getNearbyRadios(lat: number, lon: number, city?: string, countryCode?: string) {
  const byId = new Map<string, RadioStation>()
  for (const km of [60, 200, 600]) {
    const found = await radioRequest(
      `/json/stations/search?geo_lat=${lat}&geo_long=${lon}&geo_distance=${km * 1000}&has_geo_info=true&${common}&limit=150`
    ).catch(() => [] as RadioStation[])
    for (const st of found) {
      // Se comprueba la distancia aquí también, por si el servidor no aplica el filtro
      if (st.lat !== undefined && st.lon !== undefined && distanceKm(lat, lon, st.lat, st.lon) <= km) byId.set(st.id, st)
    }
    if (byId.size >= 15) break
  }
  if (city && countryCode && byId.size < 30) {
    const local = await getRadiosByCity(city, countryCode, 40).catch(() => [] as RadioStation[])
    for (const st of local) if (!byId.has(st.id)) byId.set(st.id, st)
  }
  return Array.from(byId.values())
    .map((st) => ({
      ...st,
      distanceKm: st.lat !== undefined && st.lon !== undefined ? Math.round(distanceKm(lat, lon, st.lat, st.lon)) : undefined,
    }))
    .sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999))
    .slice(0, 80)
}

// ===== TV (iptv-org) =====

const IPTV_BASE = 'https://iptv-org.github.io/iptv'

/**
 * Listas disponibles: país (cl, mx, ar…), región/provincia ISO 3166-2 (cl-rm, ar-b…),
 * "spa" = canales en español del mundo, "news" = noticias.
 */
export function tvPlaylistUrl(list: string): string | null {
  if (/^[a-z]{2}$/.test(list)) return `${IPTV_BASE}/countries/${list}.m3u`
  if (/^[a-z]{2}-[a-z0-9]{1,3}$/.test(list)) return `${IPTV_BASE}/subdivisions/${list}.m3u`
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

/** Regiones/provincias (ISO 3166-2) de un país, para la TV local. */
export async function getTvRegions(countryCode: string): Promise<{ code: string; name: string }[]> {
  const res = await fetchWithTimeout('https://iptv-org.github.io/api/subdivisions.json', { next: { revalidate: 604800 } }, 10000)
  if (!res.ok) return []
  const all = (await res.json()) as { country: string; name: string; code: string }[]
  return all
    .filter((s) => s.country === countryCode.toUpperCase())
    .map((s) => ({ code: s.code.toLowerCase(), name: s.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
}
