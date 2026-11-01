// Ecualizador con Web Audio: el <audio> del reproductor pasa por filtros (una banda cada uno),
// un nivelador de volumen opcional y sale por los parlantes. Solo se conecta a fuentes que lo
// permiten (mismo sitio, la app de Android, archivos del teléfono o con permiso CORS): con las
// demás el navegador dejaría el sonido en silencio.
import { EQ_BANDS } from '@/store/eqStore'

interface Chain {
  ctx: AudioContext
  filters: BiquadFilterNode[]
  comp: DynamicsCompressorNode
  dry: GainNode
  wet: GainNode
  out: GainNode
  limiter: DynamicsCompressorNode
}

/** Nivelador: cuánto se sube lo procesado (el compresor baja lo fuerte y esto lo vuelve a subir) */
export const LEVELER_MAKEUP = 1.3

/**
 * Margen para no saturar: se baja el total exactamente lo que sube la banda más alta. Antes se
 * bajaba la mitad y en canciones fuertes la señal pasaba el máximo: eso se oía como un
 * chisporroteo ("radio que pierde la señal").
 */
export const headroom = (gains: number[], on: boolean) => (on ? Math.pow(10, -Math.max(0, ...gains) / 20) : 1)

let ctx: AudioContext | null = null
const chains = new WeakMap<HTMLMediaElement, Chain>()

/** Conecta el <audio> al ecualizador (una sola vez por elemento) */
export function attachEqualizer(el: HTMLMediaElement): Chain | null {
  const hit = chains.get(el)
  if (hit) return hit
  try {
    // "playback": búfer de audio más grande. Con el de baja latencia (para juegos), en Android el
    // sonido se quedaba sin datos cada vez que el teléfono se ocupaba un instante → chasquidos
    ctx ??= new AudioContext({ latencyHint: 'playback' })
    const source = ctx.createMediaElementSource(el)
    const filters = EQ_BANDS.map((b) => {
      const f = ctx!.createBiquadFilter()
      f.type = b.type
      f.frequency.value = b.freq
      f.Q.value = 1.1
      return f
    })
    filters.reduce<AudioNode>((prev, f) => (prev.connect(f), f), source)
    const last = filters[filters.length - 1]
    // Nivelador: compresor suave en paralelo (seco/procesado) para no aplastar la música
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -28
    comp.knee.value = 24
    comp.ratio.value = 4
    comp.attack.value = 0.01
    comp.release.value = 0.25
    const dry = ctx.createGain()
    const wet = ctx.createGain()
    const out = ctx.createGain()
    last.connect(dry)
    last.connect(comp)
    comp.connect(wet)
    dry.connect(out)
    wet.connect(out)
    // Limitador final: atrapa cualquier pico que igual pase el máximo (nunca satura)
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -1.5
    limiter.knee.value = 0
    limiter.ratio.value = 20
    limiter.attack.value = 0.002
    limiter.release.value = 0.15
    out.connect(limiter)
    limiter.connect(ctx.destination)
    const chain = { ctx, filters, comp, dry, wet, out, limiter }
    chains.set(el, chain)
    return chain
  } catch {
    return null
  }
}

/** Aplica las bandas (dB) y el nivelador */
export function updateEqualizer(el: HTMLMediaElement, gains: number[], leveler: boolean, on: boolean) {
  const c = chains.get(el)
  if (!c) return
  const t = c.ctx.currentTime
  c.filters.forEach((f, i) => f.gain.setTargetAtTime(on ? gains[i] ?? 0 : 0, t, 0.05))
  c.dry.gain.setTargetAtTime(on && leveler ? 0 : 1, t, 0.05)
  c.wet.gain.setTargetAtTime(on && leveler ? LEVELER_MAKEUP : 0, t, 0.05)
  c.out.gain.setTargetAtTime(headroom(gains, on), t, 0.05)
}

/** Cerrar el sistema de audio (al cambiar de parlante o audífonos: el nuevo sale por el actual) */
export function resetEqualizer() {
  const old = ctx
  ctx = null
  old?.close().catch(() => {})
}

/** ¿El sistema de audio quedó detenido (p. ej. tras cambiar la salida de sonido)? */
export function equalizerStalled(): boolean {
  return !!ctx && ctx.state !== 'running'
}

/** El navegador pausa el sistema de audio hasta que se toca la pantalla: se reanuda al sonar */
export function resumeEqualizer() {
  if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {})
}

/** ¿Esta dirección se puede pasar por el ecualizador sin quedar en silencio? (mismo sitio,
 * archivos del teléfono, el servidor local de la app de Android o archive.org) */
export function eqSafeUrl(url: string | undefined): boolean {
  if (!url) return false
  if (url.startsWith('/') || url.startsWith('blob:')) return true
  try {
    const u = new URL(url, window.location.href)
    // archive.org da permiso (CORS) a sus audios: se pueden ecualizar directo
    return u.origin === window.location.origin || u.hostname === '127.0.0.1' || u.hostname === 'archive.org' || u.hostname.endsWith('.archive.org')
  } catch {
    return false
  }
}
