'use client'
// App de Android: transmitir a la TV (Chromecast / Google TV) desde la propia app: se elige la TV
// en una lista de la app y la TV reproduce sola el video, la canción o la radio.
import { getNative } from '@/lib/native'
import { useCastStore } from '@/components/CastButton'
import { useMusicStore } from '@/store/musicStore'

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
// Se recuerda qué se manda a la TV (si la página se recarga o se vuelve a la app, sigue sabiendo
// que la TV está mostrando la música / el video)
const KEY = 'cpn-cast-kind'
const save = () => {
  try {
    if (kind) localStorage.setItem(KEY, JSON.stringify({ kind, yt: castYt, at: Date.now() }))
    else localStorage.removeItem(KEY)
  } catch {}
}
/** Lo que está en la TV pasa a ser parte de la música (cola, barra, canción/video): un solo reproductor */
export const adoptMusic = () => {
  kind = 'music'
  save()
}

/** Lo que dice la TV: si reproduce, en qué segundo va y cuánto dura (la barra del teléfono lo muestra) */
export const tvSync = { playing: null as boolean | null, pos: 0, dur: 0 }
/** Segundo y duración de lo que suena en la TV (estimado entre avisos) */
export const castPosition = () => ({ t: tvSync.pos, d: tvSync.dur })
/** Segundo en que va lo que suena en la TV */
export const tvSyncPos = () => tvSync.pos

export function nativeCast(m: NativeCastMedia) {
  const b = n()
  if (!b?.castMedia) return false
  kind = m.kind
  castYt = m.yt ?? null
  save()
  const abs = (u?: string) => (u && u.startsWith('/') ? `${window.location.origin}${u}` : u)
  useCastStore.getState().setTvState('loading')
  b.castMedia(JSON.stringify({ ...m, url: abs(m.url), image: abs(m.image) }))
  return true
}

export const nativeCastStop = () => {
  kind = null
  castYt = null
  save()
  n()?.castStop?.()
}
export const nativeCastControl = (a: 'play' | 'pause' | `seek:${number}`) => n()?.castControl?.(a)
/** Video de YouTube que está en la TV (para seguir con el próximo y mostrar su tiempo) */
let castYt: string | null = null
export const castYtId = () => castYt
/** ¿La TV muestra este video (o la música que suena, si es kind música)? */
export const castingNow = () => !!useCastStore.getState().device && kind !== null
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
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || 'null') as { kind?: 'music' | 'video'; yt?: string | null; at?: number } | null
    if (o?.kind && Date.now() - (o.at ?? 0) < 12 * 60 * 60 * 1000) {
      kind = o.kind
      castYt = o.yt ?? null
    }
  } catch {}
  ;(window as unknown as { __cpnCast?: (o: { state: string; device?: string; pos?: number; dur?: number }) => void }).__cpnCast = (o) => {
    const st = useCastStore.getState()
    if (o.state === 'idle' || o.state === 'unsupported') {
      kind = null
      castYt = null
      save()
      st.setDevice(null)
      if (o.state === 'unsupported') st.setTvState('error')
      window.dispatchEvent(new Event('cpn-cast-stopped'))
      return
    }
    if (o.device) st.setDevice(o.device)
    // Página recién abierta con la TV ya sonando: si el tiempo avanza, la TV está reproduciendo
    if (o.state === 'progress' && tvSync.playing === null && typeof o.pos === 'number' && o.pos > tvSync.pos && tvSync.pos > 0) {
      tvSync.playing = true
      if (kind === 'music') useMusicStore.getState().setIsPlaying(true)
      st.setTvState('playing')
    }
    if (typeof o.pos === 'number' && isFinite(o.pos)) tvSync.pos = o.pos
    if (typeof o.dur === 'number' && isFinite(o.dur) && o.dur > 0) tvSync.dur = o.dur
    // Solo avisa la posición: no cambia nada más
    if (o.state === 'progress') return
    // Música: lo que haga la TV es lo que se ve en el teléfono (sin que el teléfono suene)
    if (o.state === 'playing' || o.state === 'paused') tvSync.playing = o.state === 'playing'
    if (kind === 'music') {
      if (o.state === 'playing' || o.state === 'paused') {
        tvSync.playing = o.state === 'playing'
        useMusicStore.getState().setIsPlaying(tvSync.playing)
      } else if (o.state === 'connecting' || o.state === 'loading' || o.state === 'connected') {
        tvSync.playing = false
        useMusicStore.getState().setIsPlaying(false)
      }
    }
    if (o.state === 'connecting' || o.state === 'loading' || o.state === 'connected') st.setTvState('loading')
    else if (o.state === 'playing' || o.state === 'paused') st.setTvState('playing')
    else if (o.state === 'error') st.setTvState('error')
    else if (o.state === 'ended') window.dispatchEvent(new Event('cpn-cast-ended'))
    window.dispatchEvent(new CustomEvent('cpn-cast-state', { detail: o.state }))
  }
}
