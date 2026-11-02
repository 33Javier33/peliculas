// Puente con la app de Android (APK). Dentro de la app existe window.CPNNative; en el
// navegador no, y todo funciona como siempre.

interface CPNNativeBridge {
  audioBase(): string
  version(): string
  mediaState(json: string): void
  /** APK 1.0.21+: menú Compartir de Android */
  share?(text: string): void
}

export function getNative(): CPNNativeBridge | null {
  if (typeof window === 'undefined') return null
  return ((window as unknown as { CPNNative?: CPNNativeBridge }).CPNNative ?? null) || null
}

export const isNativeApp = () => !!getNative()

/** Audio de una canción de YouTube obtenido por el propio teléfono (servidor local de la app) */
export function nativeAudioUrl(videoId: string): string | null {
  const n = getNative()
  if (!n || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null
  try {
    return `${n.audioBase()}/yt/${videoId}`
  } catch {
    return null
  }
}

/** Qué suena (para la notificación y la pantalla bloqueada del teléfono) */
export function reportMediaState(state: {
  title: string
  artist: string
  artwork?: string
  playing: boolean
  visible: boolean
  /** Segundo en que va y duración (barra de avance de la notificación; APK 1.0.25+) */
  position?: number
  duration?: number
  /** ¿Está en Me gusta? (botón ♥ de la notificación y del widget) */
  liked?: boolean
}) {
  const n = getNative()
  if (!n) return
  try {
    n.mediaState(JSON.stringify(state))
  } catch {}
}

interface CPNNativeVideo {
  videoState?(active: boolean): void
}

/** Hay un video sonando: al salir de la app sigue en una ventana flotante (APKs nuevos) */
export function reportVideoActive(active: boolean) {
  const n = getNative() as (CPNNativeBridge & CPNNativeVideo) | null
  try {
    n?.videoState?.(active)
  } catch {}
}

/** App de Android: dejar lista la siguiente canción (su audio y el comienzo descargado) */
export function nativePrefetch(videoId: string): boolean {
  const n = getNative() as (CPNNativeBridge & { prefetch?(id: string): void }) | null
  if (!n?.prefetch) return false
  try {
    n.prefetch(videoId)
    return true
  } catch {
    return false
  }
}

const isArchive = (url: string) => {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && (u.hostname === 'archive.org' || u.hostname.endsWith('.archive.org'))
  } catch {
    return false
  }
}

type FileBridge = CPNNativeBridge & { prefetchFile?(url: string): void }

/** App de Android (1.0.14+): audio de archive.org por el teléfono (comienzo listo y ecualizador) */
export function nativeFileUrl(url: string): string | null {
  const n = getNative() as FileBridge | null
  if (!n?.prefetchFile || !isArchive(url)) return null
  try {
    return `${n.audioBase()}/f?u=${encodeURIComponent(url)}`
  } catch {
    return null
  }
}

/** App de Android: dejar lista la siguiente canción de un disco de archive.org */
export function nativePrefetchFile(url: string): boolean {
  const n = getNative() as FileBridge | null
  if (!n?.prefetchFile || !isArchive(url)) return false
  try {
    n.prefetchFile(url)
    return true
  } catch {
    return false
  }
}

/** App de Android 1.0.24+: ecualizador hecho por el teléfono (sin pasar por Web Audio) */
export function hasNativeEq(): boolean {
  return !!(getNative() as (CPNNativeBridge & { eqNative?: unknown }) | null)?.eqNative
}

export type NativeEqStatus = 'ok' | 'busy' | 'unsupported'
export function applyNativeEq(state: { on: boolean; gains: number[]; leveler: boolean }): NativeEqStatus {
  const n = getNative() as (CPNNativeBridge & { eqNative?: (json: string) => string }) | null
  try {
    const r = n?.eqNative?.(JSON.stringify(state))
    return r === 'ok' || r === 'busy' ? r : 'unsupported'
  } catch {
    return 'unsupported'
  }
}
