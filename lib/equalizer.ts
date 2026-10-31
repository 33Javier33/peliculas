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
}

let ctx: AudioContext | null = null
const chains = new WeakMap<HTMLMediaElement, Chain>()

/** Conecta el <audio> al ecualizador (una sola vez por elemento) */
export function attachEqualizer(el: HTMLMediaElement): Chain | null {
  const hit = chains.get(el)
  if (hit) return hit
  try {
    ctx ??= new AudioContext()
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
    out.connect(ctx.destination)
    const chain = { ctx, filters, comp, dry, wet, out }
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
  c.wet.gain.setTargetAtTime(on && leveler ? 1.6 : 0, t, 0.05)
  // Al subir bandas se baja un poco el total para que no sature
  const boost = on ? Math.max(0, ...gains) : 0
  c.out.gain.setTargetAtTime(Math.pow(10, -boost / 2 / 20), t, 0.05)
}

/** El navegador pausa el sistema de audio hasta que se toca la pantalla: se reanuda al sonar */
export function resumeEqualizer() {
  if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {})
}

/** ¿Esta dirección se puede pasar por el ecualizador sin quedar en silencio? (mismo sitio,
 * archivos del teléfono o el servidor local de la app de Android) */
export function eqSafeUrl(url: string | undefined): boolean {
  if (!url) return false
  if (url.startsWith('/') || url.startsWith('blob:')) return true
  try {
    const u = new URL(url, window.location.href)
    return u.origin === window.location.origin || u.hostname === '127.0.0.1'
  } catch {
    return false
  }
}
