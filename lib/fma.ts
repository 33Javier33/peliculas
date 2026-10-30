// Free Music Archive (freemusicarchive.org): música con licencias libres (Creative Commons).
// FMA ya no tiene API pública: se leen sus páginas, donde cada canción trae sus datos en el
// atributo data-track-info (título, artista, disco, audio, imagen).
const FMA = process.env.FMA_BASE || 'https://freemusicarchive.org'

export interface FmaTrack {
  id: string
  title: string
  artist: string
  album?: string
  /** Página del disco (para guardarlo completo) */
  albumUrl?: string
  artistUrl?: string
  /** Audio MP3 */
  url: string
  image?: string
  /** Segundos */
  duration?: number
}

const decodeAttr = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

const text = (v: unknown) =>
  typeof v === 'string'
    ? decodeAttr(v)
        .replace(/<[^>]+>/g, '')
        .trim()
    : typeof v === 'number'
      ? String(v)
      : ''

function seconds(v: unknown): number | undefined {
  if (typeof v === 'number' && v > 0) return Math.round(v)
  if (typeof v !== 'string') return undefined
  const p = v.split(':').map(Number)
  const n = p.length > 1 ? p.reduce((a, b) => a * 60 + b, 0) : Number(v)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined
}

const absolute = (u: string) => {
  try {
    return new URL(u, 'https://freemusicarchive.org').toString()
  } catch {
    return ''
  }
}

/** Canciones de una página de FMA (búsqueda, disco, artista o género) */
export function parseFmaTracks(html: string): FmaTrack[] {
  const out = new Map<string, FmaTrack>()
  for (const m of Array.from(html.matchAll(/data-track-info\s*=\s*(["'])([\s\S]*?)\1/g))) {
    let d: Record<string, unknown>
    try {
      d = JSON.parse(decodeAttr(m[2]))
    } catch {
      continue
    }
    const url = text(d.playbackUrl) || text(d.fileUrl) || text(d.streamUrl) || text(d.listenUrl)
    const title = text(d.title) || text(d.trackTitle)
    if (!url || !title || !/^https?:\/\//.test(url)) continue
    const id = text(d.id) || url
    if (out.has(id)) continue
    out.set(id, {
      id,
      title,
      artist: text(d.artistName) || text(d.artist) || 'Free Music Archive',
      album: text(d.albumTitle) || text(d.album) || undefined,
      albumUrl: text(d.albumUrl) ? absolute(text(d.albumUrl)) : undefined,
      artistUrl: text(d.artistUrl) ? absolute(text(d.artistUrl)) : undefined,
      url: url.replace(/^http:/, 'https:'),
      image: (text(d.image) || text(d.imageUrl) || text(d.albumImage) || '').replace(/^http:/, 'https:') || undefined,
      duration: seconds(d.duration) ?? seconds(d.trackDuration),
    })
  }
  return Array.from(out.values())
}

/** Imagen y título de la página (og:image / og:title), para el disco */
export function fmaPageInfo(html: string): { title?: string; image?: string; description?: string } {
  const meta = (prop: string) =>
    html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`, 'i'))?.[1] ||
    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`, 'i'))?.[1]
  const clean = (s?: string) => (s ? decodeAttr(s).replace(/\s+/g, ' ').trim() : undefined)
  return { title: clean(meta('og:title')), image: clean(meta('og:image')), description: clean(meta('og:description'))?.slice(0, 1500) }
}

async function getPage(url: string): Promise<string> {
  const res = await fetch(url.replace(/^https:\/\/(www\.)?freemusicarchive\.org/, FMA), {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36',
      Accept: 'text/html',
      'Accept-Language': 'es,en;q=0.8',
    },
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(12000),
  })
  if (!res.ok) throw new Error(`Free Music Archive respondió ${res.status}`)
  return res.text()
}

/** Busca canciones en Free Music Archive (por artista, disco o canción; o por género) */
export async function searchFma(q: string, page = 1, genre = ''): Promise<FmaTrack[]> {
  const g = genre.replace(/[^A-Za-z0-9_-]/g, '')
  const url = g
    ? `${FMA}/genre/${encodeURIComponent(g)}/?pageSize=50&page=${page}&sort=interest&d=1`
    : `${FMA}/search?adv=1&quicksearch=${encodeURIComponent(q.trim())}&pageSize=50&page=${page}`
  return parseFmaTracks(await getPage(url))
}

/** Un disco (o página) de FMA completo */
export async function readFmaPage(url: string): Promise<{ tracks: FmaTrack[]; title?: string; image?: string; description?: string }> {
  const html = await getPage(url)
  return { tracks: parseFmaTracks(html), ...fmaPageInfo(html) }
}

export const isFmaUrl = (u: URL) => /(^|\.)freemusicarchive\.org$/i.test(u.hostname)
