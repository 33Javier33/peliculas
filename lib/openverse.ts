// Openverse (api.openverse.org): buscador abierto de obras con licencias libres. En audio
// trae sobre todo música de Jamendo (y de Wikimedia, ccMixter…), con el MP3 y su carátula.
// No pide clave y permite consultas desde el navegador (CORS), así que sirve como respaldo
// de Free Music Archive tanto en el servidor como desde el teléfono.
import type { FmaTrack } from '@/lib/fma'

const OPENVERSE = (typeof process !== 'undefined' && process.env.OPENVERSE_BASE) || 'https://api.openverse.org'

interface OvAudio {
  id?: string
  title?: string
  creator?: string
  url?: string
  thumbnail?: string
  duration?: number // milisegundos
  filetype?: string
  foreign_landing_url?: string
  audio_set?: { title?: string; foreign_landing_url?: string; url?: string } | null
}

export async function searchOpenverse(q: string, page = 1, genre = ''): Promise<FmaTrack[]> {
  const text = (q.trim() || genre).slice(0, 120)
  if (!text) return []
  const params = new URLSearchParams({ q: text, page_size: '20', page: String(page), category: 'music' })
  const res = await fetch(`${OPENVERSE}/v1/audio/?${params}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  })
  if (!res.ok) throw new Error(`Openverse respondió ${res.status}`)
  const data = (await res.json()) as { results?: OvAudio[] }
  return (data.results ?? [])
    .filter((r) => r.id && r.title && r.url?.startsWith('http') && (!r.filetype || /mp3|ogg|m4a|aac|opus/i.test(r.filetype)))
    .map((r) => ({
      id: `ov-${r.id}`,
      title: r.title!.trim(),
      artist: r.creator?.trim() || 'Artista independiente',
      album: r.audio_set?.title?.trim() || undefined,
      url: r.url!.replace(/^http:/, 'https:'),
      image: (r.thumbnail || r.audio_set?.url || '').replace(/^http:/, 'https:') || undefined,
      duration: r.duration ? Math.round(r.duration / 1000) : undefined,
    }))
}
