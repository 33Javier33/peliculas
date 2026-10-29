// Pluto TV: cientos de canales gratuitos y legales (películas, series, noticias, infantiles),
// con la programación del país de quien mira. Se usa la misma API que la web de Pluto TV:
//  1. "boot" entrega un token de sesión y el servidor de video para la región.
//  2. La guía entrega los canales y sus categorías.
//  3. Cada canal se ve con la dirección del "stitcher" + el token.
// Pluto decide la región por la IP: se le pasa la del usuario (X-Forwarded-For).
import { randomUUID } from 'crypto'
import { proxiedUrl } from '@/lib/hls-sign'
import type { TvChannel } from '@/lib/live'

const BOOT = process.env.PLUTO_BOOT_URL || 'https://boot.pluto.tv/v4/start'
const CHANNELS_FALLBACK = 'https://service-channels.clusters.pluto.tv'
const VOD_FALLBACK = 'https://service-vod.clusters.pluto.tv'

interface Boot {
  sessionToken?: string
  stitcherParams?: string
  servers?: { stitcher?: string; stitcherDash?: string; channels?: string; vod?: string }
}

// Desde 2026 Pluto exige la versión real de su web: se lee de pluto.tv (se guarda un día)
let appVersionCache: { at: number; v: string } | null = null
async function getAppVersion(): Promise<string> {
  if (appVersionCache && Date.now() - appVersionCache.at < 24 * 60 * 60 * 1000) return appVersionCache.v
  let v = process.env.PLUTO_APP_VERSION || ''
  if (!v) {
    try {
      const html = await fetch(process.env.PLUTO_WEB_URL || 'https://pluto.tv/', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36' },
        cache: 'no-store',
        signal: AbortSignal.timeout(6000),
      }).then((r) => r.text())
      v =
        html.match(/<meta[^>]*name="appVersion"[^>]*content="([^"]+)"/i)?.[1] ||
        html.match(/"appVersion"\s*:\s*"([^"]+)"/i)?.[1] ||
        ''
    } catch {}
  }
  v ||= '9.15.0'
  appVersionCache = { at: Date.now(), v }
  return v
}

interface Session {
  token: string
  stitcher: string
  channelsApi: string
  vodApi: string
  /** Parámetros que se agregan a cada dirección de video (incluye el token) */
  playParams: string
  headers: Record<string, string>
}
interface PlutoChannel {
  id: string
  name: string
  number?: number
  isStitched?: boolean
  stitched?: { path?: string; paths?: { type?: string; path?: string }[]; urls?: { url?: string }[] }
  images?: { type?: string; url?: string }[]
  categoryIDs?: string[]
}
interface PlutoCategory {
  id: string
  name: string
  channelIDs?: string[]
}

const memo = new Map<string, { at: number; channels: TvChannel[] }>()
const TTL = 30 * 60 * 1000

async function getJson<T>(url: string, headers: Record<string, string>): Promise<T> {
  const res = await fetch(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(12000) })
  if (!res.ok) throw new Error(`Pluto ${res.status}`)
  return (await res.json()) as T
}

const sessions = new Map<string, { at: number; session: Session }>()

/** Sesión de Pluto TV para la IP del usuario (de ella depende el país y el catálogo). */
async function getSession(userIp: string | null): Promise<Session> {
  const key = userIp ?? ''
  const hit = sessions.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.session

  const headers: Record<string, string> = {
    ...(userIp ? { 'X-Forwarded-For': userIp } : {}),
    'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
    Origin: 'https://pluto.tv',
    Referer: 'https://pluto.tv/',
  }
  // Los mismos datos que envía hoy la web de Pluto TV
  const clientId = randomUUID()
  const bootParams = new URLSearchParams({
    appName: 'web',
    appVersion: await getAppVersion(),
    clientTime: new Date().toISOString(),
    deviceDNT: '0',
    clientId,
    clientID: clientId,
    clientModelNumber: '1.0.0',
    clientModelName: 'Chrome',
    clientModel: 'web',
    clientType: 'web',
    deviceVersion: '130.0.0',
    drmCapabilities: 'widevine:L3',
    includeExtendedEvents: 'false',
    serverSideAds: 'false',
    deviceMake: 'chrome',
    deviceType: 'web',
    deviceModel: 'web',
    notificationVersion: '1',
    appLaunchCount: '1',
    lastAppLaunchDate: '',
  })
  const boot = await getJson<Boot>(`${BOOT}?${bootParams}`, headers)
  const token = boot.sessionToken
  const stitcher = boot.servers?.stitcher || boot.servers?.stitcherDash
  if (!token || !stitcher) throw new Error('Pluto sin sesión')

  // Formato 2026: solo el token y masterJWTPassthrough (los demás parámetros lo rompen)
  const params = new URLSearchParams()
  params.set('jwt', token)
  params.set('masterJWTPassthrough', '1')
  const session: Session = {
    token,
    stitcher,
    channelsApi: boot.servers?.channels || CHANNELS_FALLBACK,
    vodApi: boot.servers?.vod || VOD_FALLBACK,
    playParams: params.toString(),
    headers: { ...headers, Authorization: `Bearer ${token}` },
  }
  sessions.set(key, { at: Date.now(), session })
  if (sessions.size > 300) sessions.delete(sessions.keys().next().value as string)
  return session
}

/** Canales de Pluto TV para la IP (y país) del usuario. */
export async function getPlutoChannels(userIp: string | null, country: string): Promise<TvChannel[]> {
  const key = `${country}:${userIp ?? ''}`
  const hit = memo.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.channels

  const session = await getSession(userIp)
  const api = session.channelsApi
  const auth = session.headers
  const stitcher = session.stitcher
  const [list, categories] = await Promise.all([
    getJson<{ data?: PlutoChannel[] }>(`${api}/v2/guide/channels?channelIds=&offset=0&limit=1000&sort=number%3Aasc`, auth),
    getJson<{ data?: PlutoCategory[] }>(`${api}/v2/guide/categories`, auth).catch(() => ({ data: [] as PlutoCategory[] })),
  ])

  const categoryOf = new Map<string, string>()
  for (const c of categories.data ?? []) for (const id of c.channelIDs ?? []) if (!categoryOf.has(id)) categoryOf.set(id, c.name)
  const categoryName = new Map((categories.data ?? []).map((c) => [c.id, c.name]))

  const channels: TvChannel[] = (list.data ?? [])
    // Los canales con DRM (sin "stitched") no se pueden ver fuera de la app de Pluto
    .filter((c) => c.id && c.name && c.isStitched !== false)
    .map((c) => {
      const path =
        c.stitched?.path ||
        c.stitched?.paths?.find((p) => p.path && (p.type === 'hls' || !p.type))?.path ||
        `/stitch/hls/channel/${c.id}/master.m3u8`
      const clean = path.split('?')[0].replace(/^\/v2(?=\/)/, '')
      const url = `${stitcher}/v2${clean.startsWith('/') ? '' : '/'}${clean}?${session.playParams}`
      const logo =
        c.images?.find((i) => i.type === 'colorLogoPNG')?.url || c.images?.find((i) => i.type === 'logo')?.url || ''
      return {
        id: `pluto-${c.id}`,
        name: c.name,
        logo: logo.startsWith('https://') ? logo : '',
        url,
        // Si el navegador no puede abrirlo directo, pasa por el intermediario
        fallbackUrl: proxiedUrl(url),
        group: categoryOf.get(c.id) || categoryName.get(c.categoryIDs?.[0] ?? '') || 'Pluto TV',
      }
    })

  if (channels.length > 0) {
    memo.set(key, { at: Date.now(), channels })
    if (memo.size > 300) memo.delete(memo.keys().next().value as string)
  }
  return channels
}

// ===== Pluto TV a la carta: películas completas gratis =====

export interface FreeMovie {
  id: string
  title: string
  poster: string
  backdrop?: string
  summary?: string
  year?: string
  duration?: number // minutos
  rating?: string
  genre?: string
  /** Dirección del video (HLS o MP4) y la del intermediario como respaldo */
  url: string
  fallbackUrl?: string
}

export interface FreeMovieRow {
  name: string
  movies: FreeMovie[]
}

interface VodItem {
  _id?: string
  id?: string
  name?: string
  type?: string
  summary?: string
  description?: string
  duration?: number // milisegundos
  rating?: string
  genre?: string
  originalReleaseDate?: string
  covers?: { aspectRatio?: string; url?: string }[]
  featuredImage?: { path?: string }
  poster?: { path?: string }
  stitched?: { path?: string; paths?: { type?: string; path?: string }[] }
}

const vodMemo = new Map<string, { at: number; rows: FreeMovieRow[] }>()

/** Películas de Pluto TV a la carta, por categoría, del país del usuario. */
export async function getPlutoMovies(userIp: string | null): Promise<FreeMovieRow[]> {
  const key = userIp ?? ''
  const hit = vodMemo.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.rows

  const session = await getSession(userIp)
  const data = await getJson<{ categories?: { name?: string; items?: VodItem[] }[] }>(
    `${session.vodApi}/v4/vod/categories?includeItems=true&itemOffset=10000&offset=1000&page=1&sort=number%3Aasc`,
    session.headers
  )

  const seen = new Set<string>()
  const rows: FreeMovieRow[] = []
  for (const cat of data.categories ?? []) {
    const movies: FreeMovie[] = []
    for (const it of cat.items ?? []) {
      const id = it._id || it.id
      if (!id || !it.name || (it.type && it.type !== 'movie')) continue
      const path =
        it.stitched?.paths?.find((p) => p.type === 'hls')?.path || it.stitched?.path || `/stitch/hls/episode/${id}/master.m3u8`
      const cleanPath = path.startsWith('/v2/') ? path : `/v2${path.startsWith('/') ? '' : '/'}${path}`
      const url = `${session.stitcher}${cleanPath.split('?')[0]}?${session.playParams}`
      const cover = it.covers?.find((c) => c.aspectRatio === '347:500')?.url || it.covers?.[0]?.url
      movies.push({
        id: `pluto-${id}`,
        title: it.name,
        poster: cover || it.poster?.path || `https://images.pluto.tv/episodes/${id}/poster.jpg`,
        backdrop: it.featuredImage?.path,
        summary: it.summary || it.description,
        year: it.originalReleaseDate?.slice(0, 4),
        duration: it.duration ? Math.round(it.duration / 60000) : undefined,
        rating: it.rating,
        genre: it.genre,
        url,
        fallbackUrl: proxiedUrl(url),
      })
    }
    if (movies.length === 0) continue
    // La primera vez que aparece cada película va a su fila; así no se repiten tanto
    const fresh = movies.filter((m) => !seen.has(m.id))
    fresh.forEach((m) => seen.add(m.id))
    if (fresh.length >= 4) rows.push({ name: cat.name || 'Películas', movies: fresh })
  }

  if (rows.length > 0) {
    vodMemo.set(key, { at: Date.now(), rows })
    if (vodMemo.size > 300) vodMemo.delete(vodMemo.keys().next().value as string)
  }
  return rows
}
