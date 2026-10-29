// Audio propio: el servidor de la app obtiene el audio de YouTube (cliente ANDROID_VR, que no
// necesita resolver el JavaScript del reproductor) y lo reenvía al teléfono. No depende de los
// servidores públicos de Piped/Invidious, que suelen estar caídos. Así el audio sigue sonando
// con la pantalla bloqueada o fuera de la app.
import { Innertube, Constants } from 'youtubei.js'

let client: Promise<Innertube> | null = null
const getClient = () =>
  (client ??= Innertube.create({
    retrieve_player: false,
    generate_session_locally: true,
    // Que una respuesta lenta de YouTube no deje la canción esperando
    fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(8000) }),
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
  contentLength?: number
}

const cache = new Map<string, { at: number; audio: OwnAudio }>()
const TTL = 3 * 60 * 60 * 1000 // las direcciones de YouTube duran ~6 h

const CLIENTS = ['ANDROID_VR', 'IOS', 'TV_EMBEDDED'] as const

export async function resolveOwnAudio(id: string, fresh = false): Promise<OwnAudio> {
  const hit = cache.get(id)
  if (!fresh && hit && Date.now() - hit.at < TTL) return hit.audio
  const yt = await getClient()
  let lastError: unknown
  for (const c of CLIENTS) {
    try {
      const format = await yt.getStreamingData(id, { type: 'audio', quality: 'best', format: 'mp4', client: c })
      const url = format.url || (await format.decipher(yt.session.player))
      if (!url) throw new Error('sin dirección')
      const clients = Constants.CLIENTS as Record<string, { USER_AGENT?: string }>
      const audio: OwnAudio = {
        url,
        userAgent: clients[c]?.USER_AGENT || 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36',
        mimeType: (format.mime_type || 'audio/mp4').split(';')[0],
        bitrate: format.bitrate || 0,
        contentLength: format.content_length ? Number(format.content_length) : undefined,
      }
      cache.set(id, { at: Date.now(), audio })
      if (cache.size > 500) cache.delete(cache.keys().next().value as string)
      return audio
    } catch (err) {
      lastError = err
    }
  }
  throw lastError instanceof Error ? lastError : new Error('audio no disponible')
}
