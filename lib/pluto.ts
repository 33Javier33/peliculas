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

interface Boot {
  sessionToken?: string
  stitcherParams?: string
  servers?: { stitcher?: string; channels?: string }
}
interface PlutoChannel {
  id: string
  name: string
  number?: number
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

/** Canales de Pluto TV para la IP (y país) del usuario. */
export async function getPlutoChannels(userIp: string | null, country: string): Promise<TvChannel[]> {
  const key = `${country}:${userIp ?? ''}`
  const hit = memo.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.channels

  const ipHeader: Record<string, string> = userIp ? { 'X-Forwarded-For': userIp } : {}
  const headers = {
    ...ipHeader,
    'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
    Origin: 'https://pluto.tv',
    Referer: 'https://pluto.tv/',
  }
  const clientId = randomUUID()
  const bootParams = new URLSearchParams({
    appName: 'web',
    appVersion: '9.0.0',
    deviceVersion: '120.0.0',
    deviceModel: 'web',
    deviceMake: 'chrome',
    deviceType: 'web',
    clientID: clientId,
    clientModelNumber: '1.0.0',
    serverSideAds: 'false',
    channelSlug: '',
  })
  const boot = await getJson<Boot>(`${BOOT}?${bootParams}`, headers)
  const token = boot.sessionToken
  const stitcher = boot.servers?.stitcher
  if (!token || !stitcher) throw new Error('Pluto sin sesión')

  const api = boot.servers?.channels || CHANNELS_FALLBACK
  const auth = { ...headers, Authorization: `Bearer ${token}` }
  const [list, categories] = await Promise.all([
    getJson<{ data?: PlutoChannel[] }>(`${api}/v2/guide/channels?channelIds=&offset=0&limit=1000&sort=number%3Aasc`, auth),
    getJson<{ data?: PlutoCategory[] }>(`${api}/v2/guide/categories`, auth).catch(() => ({ data: [] as PlutoCategory[] })),
  ])

  const categoryOf = new Map<string, string>()
  for (const c of categories.data ?? []) for (const id of c.channelIDs ?? []) if (!categoryOf.has(id)) categoryOf.set(id, c.name)
  const categoryName = new Map((categories.data ?? []).map((c) => [c.id, c.name]))

  const params = new URLSearchParams(boot.stitcherParams || '')
  params.set('jwt', token)
  params.set('masterJWTPassthrough', 'true')

  const channels: TvChannel[] = (list.data ?? [])
    .filter((c) => c.id && c.name)
    .map((c) => {
      const url = `${stitcher}/v2/stitch/hls/channel/${c.id}/master.m3u8?${params}`
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
