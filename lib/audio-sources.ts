// Fuentes de solo-audio para reproducir en segundo plano (pantalla bloqueada / app minimizada).
// El reproductor de YouTube se pausa al ocultarse la página, así que en "modo audio" usamos un
// <audio> propio con streams obtenidos a través de instancias públicas de Piped e Invidious.
// Estas instancias cambian con frecuencia: se consultan varias en paralelo y la lista se puede
// sobrescribir con las variables PIPED_INSTANCES / INVIDIOUS_INSTANCES (separadas por comas).

export interface AudioCandidate {
  url: string
  mimeType: string
  bitrate: number
  source: string
}

const DEFAULT_PIPED = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://api.piped.private.coffee',
  'https://pipedapi.r4fo.com',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.nosebs.ru',
]

const DEFAULT_INVIDIOUS = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://invidious.f5.si',
  'https://yewtu.be',
  'https://inv.tux.pizza',
  'https://invidious.privacyredirect.com',
]

const TIMEOUT_MS = 7000
const MAX_PER_KIND = 5

function fromEnv(name: string): string[] {
  const raw = typeof process !== 'undefined' ? process.env?.[name] : undefined
  return raw ? raw.split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean) : []
}

export async function fetchJson<T>(url: string, timeout = TIMEOUT_MS): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

// ---- Listas de instancias (públicas, actualizadas por sus comunidades) ----

let instanceCache: { at: number; piped: string[]; invidious: string[] } | null = null

export async function getInstances() {
  if (instanceCache && Date.now() - instanceCache.at < 6 * 60 * 60 * 1000) return instanceCache

  const envPiped = fromEnv('PIPED_INSTANCES')
  const envInv = fromEnv('INVIDIOUS_INSTANCES')

  const [pipedList, invList] = await Promise.all([
    fetchJson<{ api_url?: string }[]>('https://piped-instances.kavin.rocks/', 5000)
      .then((list) => list.map((i) => i.api_url).filter((u): u is string => !!u))
      .catch(() => [] as string[]),
    fetchJson<[string, { api?: boolean | null; type?: string; uri?: string }][]>(
      'https://api.invidious.io/instances.json?sort_by=health',
      5000
    )
      .then((list) =>
        list
          .filter(([, i]) => i.api === true && i.type === 'https' && i.uri)
          .map(([, i]) => i.uri as string)
      )
      .catch(() => [] as string[]),
  ])

  const uniq = (arr: string[]) => Array.from(new Set(arr.map((u) => u.replace(/\/$/, ''))))
  instanceCache = {
    at: Date.now(),
    piped: uniq([...envPiped, ...pipedList, ...DEFAULT_PIPED]),
    invidious: uniq([...envInv, ...invList, ...DEFAULT_INVIDIOUS]),
  }
  return instanceCache
}

// ---- Piped ----

interface PipedStreams {
  audioStreams?: { url: string; mimeType?: string; bitrate?: number; format?: string }[]
}

async function fromPiped(base: string, id: string): Promise<AudioCandidate[]> {
  const data = await fetchJson<PipedStreams>(`${base}/streams/${encodeURIComponent(id)}`)
  return (data.audioStreams ?? [])
    .filter((s) => s.url)
    .map((s) => ({
      url: s.url,
      mimeType: s.mimeType || (s.format === 'M4A' ? 'audio/mp4' : 'audio/webm'),
      bitrate: s.bitrate || 0,
      source: base,
    }))
}

// ---- Invidious ----

interface InvidiousVideo {
  adaptiveFormats?: { itag: string | number; type?: string; bitrate?: string | number }[]
}

async function fromInvidious(base: string, id: string): Promise<AudioCandidate[]> {
  const data = await fetchJson<InvidiousVideo>(
    `${base}/api/v1/videos/${encodeURIComponent(id)}?fields=adaptiveFormats`
  )
  return (data.adaptiveFormats ?? [])
    .filter((f) => f.type?.startsWith('audio/'))
    .map((f) => ({
      // local=true: el audio pasa por la instancia (las URLs directas de Google están atadas a su IP)
      url: `${base}/latest_version?id=${encodeURIComponent(id)}&itag=${f.itag}&local=true`,
      mimeType: (f.type || 'audio/mp4').split(';')[0],
      bitrate: Number(f.bitrate) || 0,
      source: base,
    }))
}

// Preferimos M4A/AAC (compatible con todos los móviles) y mejor calidad primero.
function rank(list: AudioCandidate[]): AudioCandidate[] {
  return list.sort((a, b) => {
    const am = a.mimeType === 'audio/mp4' ? 1 : 0
    const bm = b.mimeType === 'audio/mp4' ? 1 : 0
    return bm - am || b.bitrate - a.bitrate
  })
}

/**
 * Devuelve candidatos de audio para un video, ordenados del mejor al peor.
 * De cada instancia que responde se toma solo su mejor stream, para que el
 * cliente pueda pasar a otra instancia si una falla al reproducir.
 */
export async function findAudioCandidates(id: string): Promise<AudioCandidate[]> {
  const { piped, invidious } = await getInstances()

  const tasks = [
    ...piped.slice(0, MAX_PER_KIND).map((b) => fromPiped(b, id)),
    ...invidious.slice(0, MAX_PER_KIND).map((b) => fromInvidious(b, id)),
  ]
  const results = await Promise.allSettled(tasks)

  const best: AudioCandidate[] = []
  for (const r of results) {
    if (r.status !== 'fulfilled' || r.value.length === 0) continue
    const ranked = rank(r.value)
    best.push(ranked[0])
    // Si el mejor no es M4A, añadimos también el M4A de esa instancia como respaldo
    const m4a = ranked.find((c) => c.mimeType === 'audio/mp4')
    if (m4a && m4a !== ranked[0]) best.push(m4a)
  }
  return rank(best)
}

export function isValidVideoId(id: string | null): id is string {
  return !!id && /^[A-Za-z0-9_-]{6,20}$/.test(id)
}

// ===== Video completo (audio + imagen) para cuando YouTube no deja insertar el video =====

export interface VideoCandidate {
  url: string
  quality: number // altura en píxeles (360, 720…)
  source: string
}

interface PipedVideoStreams {
  videoStreams?: { url: string; mimeType?: string; quality?: string; videoOnly?: boolean }[]
}

async function videoFromPiped(base: string, id: string): Promise<VideoCandidate[]> {
  const data = await fetchJson<PipedVideoStreams>(`${base}/streams/${encodeURIComponent(id)}`)
  return (data.videoStreams ?? [])
    // Solo streams con audio incluido y en MP4 (se reproducen en cualquier navegador)
    .filter((s) => s.url && s.videoOnly === false && (s.mimeType || '').includes('mp4'))
    .map((s) => ({ url: s.url, quality: parseInt(s.quality || '0', 10) || 0, source: base }))
}

interface InvidiousFormats {
  formatStreams?: { itag: string | number; type?: string; resolution?: string; qualityLabel?: string }[]
}

async function videoFromInvidious(base: string, id: string): Promise<VideoCandidate[]> {
  const data = await fetchJson<InvidiousFormats>(`${base}/api/v1/videos/${encodeURIComponent(id)}?fields=formatStreams`)
  return (data.formatStreams ?? [])
    .filter((f) => (f.type || '').startsWith('video/mp4'))
    .map((f) => ({
      // formatStreams ya traen audio y video juntos; local=true los sirve la propia instancia
      url: `${base}/latest_version?id=${encodeURIComponent(id)}&itag=${f.itag}&local=true`,
      quality: parseInt(f.resolution || f.qualityLabel || '0', 10) || 0,
      source: base,
    }))
}

/** Candidatos de video (mejor calidad primero, uno por instancia que responda). */
export async function findVideoCandidates(id: string): Promise<VideoCandidate[]> {
  const { piped, invidious } = await getInstances()
  const results = await Promise.allSettled([
    ...piped.slice(0, MAX_PER_KIND).map((b) => videoFromPiped(b, id)),
    ...invidious.slice(0, MAX_PER_KIND).map((b) => videoFromInvidious(b, id)),
  ])
  const best: VideoCandidate[] = []
  for (const r of results) {
    if (r.status !== 'fulfilled' || r.value.length === 0) continue
    best.push(r.value.sort((a, b) => b.quality - a.quality)[0])
  }
  return best.sort((a, b) => b.quality - a.quality)
}
