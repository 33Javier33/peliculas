// NTS Radio (Londres): API pública de su sitio. Dos canales en vivo con la programación y 16
// "Infinite Mixtapes" (canales temáticos que suenan las 24 horas). Las transmisiones son públicas.
const NTS = process.env.NTS_BASE || 'https://www.nts.live'

export interface NtsShow {
  title: string
  start: string
  end: string
  picture?: string
  location?: string
  description?: string
  genres: string[]
}

export interface NtsChannel {
  id: string // "1" | "2"
  stream: string
  now: NtsShow
  next: NtsShow[]
}

export interface NtsMixtape {
  alias: string
  title: string
  subtitle: string
  description?: string
  stream: string
  picture?: string
}

const decode = (s = '') =>
  s
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/<[^>]+>/g, '')
    .trim()

interface RawShow {
  broadcast_title?: string
  start_timestamp?: string
  end_timestamp?: string
  embeds?: { details?: { description?: string; location_long?: string; media?: { picture_large?: string; picture_medium?: string }; genres?: { value?: string }[] } }
}

const show = (r: RawShow | undefined): NtsShow | null =>
  r?.broadcast_title
    ? {
        title: decode(r.broadcast_title),
        start: r.start_timestamp || '',
        end: r.end_timestamp || '',
        picture: r.embeds?.details?.media?.picture_large || r.embeds?.details?.media?.picture_medium,
        location: r.embeds?.details?.location_long || undefined,
        description: decode(r.embeds?.details?.description).slice(0, 400) || undefined,
        genres: (r.embeds?.details?.genres ?? []).map((g) => decode(g.value)).filter(Boolean).slice(0, 4),
      }
    : null

async function get<T>(path: string, revalidate: number): Promise<T> {
  const r = await fetch(`${NTS}${path}`, {
    headers: { 'User-Agent': 'CarlosPNautoInteractive/1.0' },
    next: { revalidate },
    signal: AbortSignal.timeout(10000),
  })
  if (!r.ok) throw new Error(`NTS ${r.status}`)
  return r.json() as Promise<T>
}

export async function getNtsLive(): Promise<NtsChannel[]> {
  const d = await get<{ results?: (Record<string, RawShow> & { channel_name?: string })[] }>('/api/v2/live', 60)
  return (d.results ?? [])
    .map((c) => {
      const id = String(c.channel_name || '')
      const now = show(c.now)
      if (!now || !/^[12]$/.test(id)) return null
      const next = Array.from({ length: 17 }, (_, i) => show(c[i === 0 ? 'next' : `next${i + 1}`])).filter((x): x is NtsShow => !!x)
      return { id, stream: `https://stream-relay-geo.ntslive.net/stream${id === '1' ? '' : '2'}`, now, next }
    })
    .filter((x): x is NtsChannel => !!x)
}

export async function getNtsMixtapes(): Promise<NtsMixtape[]> {
  const d = await get<{
    results?: { mixtape_alias?: string; title?: string; subtitle?: string; description?: string; audio_stream_endpoint?: string; media?: { picture_large?: string; picture_medium?: string } }[]
  }>('/api/v2/mixtapes', 3600)
  return (d.results ?? [])
    .filter((m) => m.mixtape_alias && m.audio_stream_endpoint?.startsWith('https://'))
    .map((m) => ({
      alias: m.mixtape_alias!,
      title: decode(m.title),
      subtitle: decode(m.subtitle),
      description: decode(m.description).slice(0, 300) || undefined,
      stream: m.audio_stream_endpoint!,
      picture: m.media?.picture_large || m.media?.picture_medium,
    }))
}
