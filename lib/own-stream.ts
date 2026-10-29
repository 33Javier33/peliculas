// Audio propio: el servidor de la app obtiene el audio de YouTube y lo reenvía al teléfono.
// No depende de los servidores públicos de Piped/Invidious, que suelen estar caídos. Así el
// audio sigue sonando con la pantalla bloqueada o fuera de la app.
// Se prueban varios "clientes" de YouTube (como lo hace yt-dlp): si uno es rechazado, el siguiente.
import { Innertube, Constants } from 'youtubei.js'

let client: Promise<Innertube> | null = null
const getClient = () =>
  (client ??= Innertube.create({
    // Con el reproductor se pueden descifrar las direcciones de los clientes web/TV
    retrieve_player: true,
    // Que una respuesta lenta de YouTube no deje la canción esperando
    fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }),
  }).catch((err) => {
    client = null
    throw err
  }))

export interface OwnAudio {
  url: string
  /** User-Agent del cliente con que se obtuvo (YouTube lo exige igual al bajar el audio) */
  userAgent: string
  mimeType: string
  bitrate: number
  client: string
}

const cache = new Map<string, { at: number; audio: OwnAudio }>()
const TTL = 3 * 60 * 60 * 1000 // las direcciones de YouTube duran ~6 h

// Orden de prueba; el último que funcionó pasa adelante
let order = ['ANDROID_VR', 'TV', 'WEB_EMBEDDED', 'IOS', 'MWEB', 'TV_SIMPLY', 'ANDROID'] as const
type Client = (typeof order)[number]

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

export async function resolveOwnAudio(id: string, fresh = false): Promise<OwnAudio> {
  const hit = cache.get(id)
  if (!fresh && hit && Date.now() - hit.at < TTL) return hit.audio
  const yt = await getClient()
  const errors: string[] = []
  for (const c of order) {
    try {
      const format = await yt.getStreamingData(id, { type: 'audio', quality: 'best', format: 'mp4', client: c })
      const url = format.url || (await format.decipher(yt.session.player))
      if (!url) throw new Error('sin dirección')
      const clients = Constants.CLIENTS as Record<string, { USER_AGENT?: string }>
      const audio: OwnAudio = {
        url,
        userAgent: clients[c]?.USER_AGENT || BROWSER_UA,
        mimeType: (format.mime_type || 'audio/mp4').split(';')[0],
        bitrate: format.bitrate || 0,
        client: c,
      }
      cache.set(id, { at: Date.now(), audio })
      if (cache.size > 500) cache.delete(cache.keys().next().value as string)
      if (order[0] !== c) order = [c, ...order.filter((x) => x !== c)] as unknown as typeof order
      return audio
    } catch (err) {
      errors.push(`${c}: ${((err as Error).message || 'error').slice(0, 80)}`)
    }
  }
  throw new Error(errors.join(' | '))
}

export type { Client }
