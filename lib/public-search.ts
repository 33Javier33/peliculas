// Búsqueda de respaldo sin la API oficial de YouTube (que tiene un límite diario de
// búsquedas). Usa las mismas instancias públicas de Invidious y Piped que el modo audio.
import { getInstances, fetchJson } from '@/lib/audio-sources'

export interface PublicVideo {
  id: string
  title: string
  author: string
  thumbnail: string
  lengthSeconds?: number
  views?: number
  published?: string
}

interface InvidiousItem {
  type?: string
  videoId?: string
  title?: string
  author?: string
  lengthSeconds?: number
  viewCount?: number
  publishedText?: string
}

interface PipedItem {
  type?: string
  url?: string
  title?: string
  uploaderName?: string
  duration?: number
  views?: number
  uploadedDate?: string
}

const thumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`

function fromInvidious(items: InvidiousItem[]): PublicVideo[] {
  return items
    .filter((i) => (i.type ?? 'video') === 'video' && i.videoId && i.title)
    .map((i) => ({
      id: i.videoId as string,
      title: i.title as string,
      author: i.author || '',
      thumbnail: thumb(i.videoId as string),
      lengthSeconds: i.lengthSeconds,
      views: i.viewCount,
      published: i.publishedText,
    }))
}

function fromPiped(items: PipedItem[]): PublicVideo[] {
  return items
    .filter((i) => (i.type ?? 'stream') === 'stream' && i.url?.includes('v=') && i.title)
    .map((i) => {
      const id = new URLSearchParams(i.url!.split('?')[1]).get('v') as string
      return {
        id,
        title: i.title as string,
        author: i.uploaderName || '',
        thumbnail: thumb(id),
        lengthSeconds: i.duration && i.duration > 0 ? i.duration : undefined,
        views: i.views,
        published: i.uploadedDate,
      }
    })
    .filter((v) => /^[A-Za-z0-9_-]{11}$/.test(v.id))
}

/** Gana la primera instancia que responda con resultados. */
async function firstNonEmpty(tasks: Promise<PublicVideo[]>[]): Promise<PublicVideo[]> {
  return Promise.any(
    tasks.map((t) => t.then((v) => (v.length > 0 ? v : Promise.reject(new Error('vacío')))))
  ).catch(() => [])
}

/** Busca videos (página 1, 2, …). */
export async function publicSearch(query: string, page = 1): Promise<PublicVideo[]> {
  const { piped, invidious } = await getInstances()
  const q = encodeURIComponent(query)
  const tasks = invidious
    .slice(0, 5)
    .map((base) =>
      fetchJson<InvidiousItem[]>(`${base}/api/v1/search?q=${q}&type=video&page=${page}`).then(fromInvidious)
    )
  // Piped no tiene páginas numeradas: solo para la primera
  if (page === 1) {
    tasks.push(
      ...piped
        .slice(0, 4)
        .map((base) => fetchJson<{ items?: PipedItem[] }>(`${base}/search?q=${q}&filter=videos`).then((d) => fromPiped(d.items ?? [])))
    )
  }
  return firstNonEmpty(tasks)
}

/** Música en tendencia de un país, sin la API oficial. */
export async function publicTrendingMusic(region: string): Promise<PublicVideo[]> {
  const { piped, invidious } = await getInstances()
  return firstNonEmpty([
    ...invidious
      .slice(0, 5)
      .map((base) =>
        fetchJson<InvidiousItem[]>(`${base}/api/v1/trending?type=music&region=${encodeURIComponent(region)}`).then(fromInvidious)
      ),
    ...piped.slice(0, 3).map((base) => fetchJson<PipedItem[]>(`${base}/trending?region=${encodeURIComponent(region)}`).then(fromPiped)),
  ])
}

export function formatSeconds(total?: number): string | undefined {
  if (!total || total <= 0) return undefined
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = Math.floor(total % 60)
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

// ===== Control de la cuota de YouTube =====
// Si la API responde "cuota agotada", no se vuelve a intentar durante un rato:
// así las búsquedas van directo al respaldo y responden más rápido.
let quotaBlockedUntil = 0

export function isQuotaBlocked() {
  return Date.now() < quotaBlockedUntil
}

export function noteYouTubeError(status: number, message: string) {
  if (status === 403 || /quota/i.test(message)) quotaBlockedUntil = Date.now() + 60 * 60 * 1000
}
