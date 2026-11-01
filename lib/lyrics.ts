// Letras de canciones desde LRCLIB (gratis, sin clave): sincronizadas (LRC, con el segundo de cada
// línea) para seguirlas como karaoke, o el texto simple si no hay sincronizadas.
const LRCLIB = process.env.LRCLIB_BASE || 'https://lrclib.net'
const UA = 'CarlosPNautoInteractive/1.0 (https://peliculas-neon.vercel.app)'

export interface LyricLine {
  /** Segundo en que empieza la línea */
  t: number
  text: string
}

export interface Lyrics {
  synced: LyricLine[] | null
  plain: string | null
  instrumental?: boolean
  source: string
}

interface LrcItem {
  trackName?: string
  artistName?: string
  duration?: number
  instrumental?: boolean
  plainLyrics?: string | null
  syncedLyrics?: string | null
}

/** "[01:23.45] texto" → líneas con su segundo */
export function parseLrc(lrc: string): LyricLine[] {
  const out: LyricLine[] = []
  for (const raw of lrc.split(/\r?\n/)) {
    const times = Array.from(raw.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g))
    if (!times.length) continue
    const text = raw.replace(/\[[^\]]*\]/g, '').trim()
    for (const m of times) {
      const frac = m[3] ? Number(m[3]) / Math.pow(10, m[3].length) : 0
      out.push({ t: Number(m[1]) * 60 + Number(m[2]) + frac, text })
    }
  }
  return out.sort((a, b) => a.t - b.t)
}

/** Título y artista limpios ("Canción (Official Video) [HD]" → "Canción") */
export function cleanSong(artist: string, title: string) {
  const t = title
    .replace(/\s*[([](official|oficial|video|audio|lyrics?|letra|hd|hq|4k|remaster(ed)?|live|en vivo|videoclip|visualizer)[^)\]]*[)\]]/gi, '')
    .replace(/\s+(ft\.?|feat\.?|featuring)\s+.*$/i, '')
    .replace(/\s*\|.*$/, '')
    .trim()
  const a = artist
    .replace(/\s*-\s*topic$/i, '')
    .replace(/vevo$/i, '')
    .split(/;|,|\s&\s|\s+(?:ft\.?|feat\.?)\s+/i)[0]
    .trim()
  return { artist: a, title: t || title }
}

async function lrc<T>(path: string): Promise<T | null> {
  const res = await fetch(`${LRCLIB}${path}`, {
    headers: { 'User-Agent': UA, 'Lrclib-Client': UA },
    next: { revalidate: 7 * 86400 },
    signal: AbortSignal.timeout(9000),
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`LRCLIB ${res.status}`)
  return (await res.json()) as T
}

const norm = (s = '') =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

export async function getLyrics(artistRaw: string, titleRaw: string, duration?: number): Promise<Lyrics | null> {
  const { artist, title } = cleanSong(artistRaw, titleRaw)
  if (!title) return null
  const pick = (it: LrcItem | null): Lyrics | null => {
    if (!it) return null
    if (it.instrumental) return { synced: null, plain: null, instrumental: true, source: 'LRCLIB' }
    const synced = it.syncedLyrics ? parseLrc(it.syncedLyrics) : null
    if (!synced?.length && !it.plainLyrics) return null
    return { synced: synced?.length ? synced : null, plain: it.plainLyrics || null, source: 'LRCLIB' }
  }
  // 1) Coincidencia exacta (con la duración, si se conoce)
  const params = new URLSearchParams({ artist_name: artist, track_name: title })
  if (duration && duration > 0) params.set('duration', String(Math.round(duration)))
  const exact = pick(await lrc<LrcItem>(`/api/get?${params}`).catch(() => null))
  if (exact?.synced || exact?.instrumental) return exact
  // 2) Búsqueda: la del mismo artista y duración parecida, mejor si es sincronizada
  const list = (await lrc<LrcItem[]>(`/api/search?${new URLSearchParams({ track_name: title, artist_name: artist })}`).catch(() => null)) ?? []
  const a = norm(artist)
  const candidates = list.filter((x) => !a || norm(x.artistName).includes(a) || a.includes(norm(x.artistName)))
  const close = (x: LrcItem) => !duration || !x.duration || Math.abs(x.duration - duration) < 8
  const best = candidates.find((x) => x.syncedLyrics && close(x)) || candidates.find((x) => x.syncedLyrics) || candidates.find((x) => x.plainLyrics)
  return pick(best ?? null) ?? exact
}
