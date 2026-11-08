'use client'
// App de Android: transmitir a la TV (Chromecast / Google TV) desde la propia app: se elige la TV
// en una lista de la app y la TV reproduce sola el video, la canción o la radio.
import { getNative } from '@/lib/native'
import { useCastStore } from '@/components/CastButton'

type N = {
  castMedia?: (json: string) => void
  castStop?: () => void
  castControl?: (a: string) => void
  openMirroring?: () => void
}
const n = () => getNative() as unknown as N | null

export interface NativeCastMedia {
  /** Dirección directa (radio, archivo, película, canal) */
  url?: string
  /** O un video de YouTube (el teléfono se lo pasa a la TV) */
  yt?: string
  /** Con imagen (video) o solo sonido (canción) */
  video?: boolean
  title: string
  subtitle?: string
  image?: string
  live?: boolean
  /** Segundo desde el que sigue en la TV */
  position?: number
  /** Música (sigue la cola en la TV) o un video suelto */
  kind: 'music' | 'video'
}

export const nativeCastAvailable = () => !!n()?.castMedia

let kind: 'music' | 'video' | null = null
export const castKind = () => kind

export function nativeCast(m: NativeCastMedia) {
  const b = n()
  if (!b?.castMedia) return false
  kind = m.kind
  const abs = (u?: string) => (u && u.startsWith('/') ? `${window.location.origin}${u}` : u)
  useCastStore.getState().setTvState('loading')
  b.castMedia(JSON.stringify({ ...m, url: abs(m.url), image: abs(m.image) }))
  return true
}

export const nativeCastStop = () => {
  kind = null
  n()?.castStop?.()
}
export const nativeCastControl = (a: 'play' | 'pause') => n()?.castControl?.(a)
/** TV sin Chromecast: abre «Transmitir / Smart View / Duplicar pantalla» del teléfono */
export const openMirroring = () => {
  const b = n()
  if (!b?.openMirroring) return false
  b.openMirroring()
  return true
}
export const canOpenMirroring = () => !!n()?.openMirroring

// Estado que manda la app: conectando, cargando, sonando, terminó, error, desconectada
if (typeof window !== 'undefined') {
  ;(window as unknown as { __cpnCast?: (o: { state: string; device?: string }) => void }).__cpnCast = (o) => {
    const st = useCastStore.getState()
    if (o.state === 'idle' || o.state === 'unsupported') {
      kind = null
      st.setDevice(null)
      if (o.state === 'unsupported') st.setTvState('error')
      window.dispatchEvent(new Event('cpn-cast-stopped'))
      return
    }
    if (o.device) st.setDevice(o.device)
    if (o.state === 'connecting' || o.state === 'loading' || o.state === 'connected') st.setTvState('loading')
    else if (o.state === 'playing' || o.state === 'paused') st.setTvState('playing')
    else if (o.state === 'error') st.setTvState('error')
    else if (o.state === 'ended') window.dispatchEvent(new Event('cpn-cast-ended'))
    window.dispatchEvent(new CustomEvent('cpn-cast-state', { detail: o.state }))
  }
}
