// Puente con la app de Android (APK). Dentro de la app existe window.CPNNative; en el
// navegador no, y todo funciona como siempre.

interface CPNNativeBridge {
  audioBase(): string
  version(): string
  mediaState(json: string): void
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
export function reportMediaState(state: { title: string; artist: string; artwork?: string; playing: boolean; visible: boolean }) {
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
