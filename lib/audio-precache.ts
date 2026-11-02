// Canciones que vienen en la cola (radio de Internet Archive, discos y enlaces): se descargan
// completas antes de que les toque sonar, de a una y en segundo plano. Al llegar su turno suenan
// desde el teléfono, sin esperar a internet (el cambio de canción es inmediato).
// Solo se guardan en memoria las próximas (se liberan al pasar) y no se descarga con "Ahorro de datos".

interface Entry {
  status: 'loading' | 'ready' | 'failed'
  url?: string
  size?: number
  ctrl?: AbortController
}

const cache = new Map<string, Entry>()
const MAX_FILE = 40 * 1024 * 1024 // archivos más grandes (conciertos enteros) no se descargan
let running = false
let wanted: string[] = []

/** Copia ya descargada de una canción (blob:…), si está lista */
export function precachedUrl(src: string | undefined): string | null {
  if (!src) return null
  const e = cache.get(src)
  return e?.status === 'ready' && e.url ? e.url : null
}

function ahead(): number {
  const c = (navigator as unknown as { connection?: { saveData?: boolean; type?: string; effectiveType?: string } }).connection
  if (c?.saveData) return 0
  if (c?.type === 'cellular' || c?.effectiveType === '3g' || c?.effectiveType === '2g') return 2
  return 3
}

async function download(src: string) {
  const ctrl = new AbortController()
  const entry: Entry = { status: 'loading', ctrl }
  cache.set(src, entry)
  try {
    const r = await fetch(src, { signal: ctrl.signal })
    if (!r.ok || !r.body) throw new Error(String(r.status))
    const len = Number(r.headers.get('content-length') || 0)
    if (len > MAX_FILE) throw new Error('grande')
    const reader = r.body.getReader()
    const parts: Uint8Array[] = []
    let size = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      parts.push(value)
      size += value.length
      if (size > MAX_FILE) throw new Error('grande')
    }
    const blob = new Blob(parts as BlobPart[], { type: r.headers.get('content-type') || 'audio/mpeg' })
    if (cache.get(src) !== entry) return // ya no hace falta
    entry.status = 'ready'
    entry.url = URL.createObjectURL(blob)
    entry.size = size
    entry.ctrl = undefined
  } catch {
    if (cache.get(src) === entry) {
      entry.status = 'failed'
      entry.ctrl = undefined
    }
  }
}

async function pump() {
  if (running) return
  running = true
  try {
    for (;;) {
      const next = wanted.find((u) => !cache.has(u))
      if (!next) break
      await download(next)
    }
  } finally {
    running = false
  }
}

/**
 * Lo que suena ahora y lo que viene (en orden). Se descargan las próximas y se sueltan las que ya
 * pasaron. `current` no se suelta mientras suena.
 */
export function precacheUpcoming(current: string | undefined, upcoming: string[]) {
  if (typeof window === 'undefined') return
  const n = ahead()
  wanted = upcoming.filter((u) => /^https?:\/\//.test(u)).slice(0, n)
  const keep = new Set([...wanted, ...(current ? [current] : [])])
  for (const [src, e] of Array.from(cache.entries())) {
    if (keep.has(src)) continue
    e.ctrl?.abort()
    cache.delete(src)
    // Se libera un poco después (por si el reproductor justo la está cerrando)
    if (e.url) setTimeout(() => URL.revokeObjectURL(e.url!), 10000)
  }
  if (wanted.length) pump()
}

/** ¿Se están descargando antes las canciones? (no con "Ahorro de datos") */
export const precacheEnabled = () => typeof navigator !== 'undefined' && ahead() > 0
