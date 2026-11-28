// Sincronía entre la imagen del video y el sonido de la canción.
// El teléfono tarda un poco en hacer sonar el audio (parlante ~0,05-0,1 s; audífonos o parlantes
// Bluetooth 0,15-0,3 s o más): el «segundo» del audio va adelantado a lo que se escucha. La imagen
// se pega a lo que se ESCUCHA: se le descuenta ese retraso (automático) y el ajuste de la persona
// (Configuración → Sincronía de los videos).

const KEY = 'cpn-av-offset'
export const AV_EVENT = 'cpn-av-offset'

let autoLatency: number | null = null

/** Retraso del sonido: el que informa el teléfono (incluye el Bluetooth) o el navegador; si no, 0,1 s */
export function audioLatency(): number {
  // App de Android (1.0.172+): el teléfono lo sabe exacto y cambia al conectar o desconectar audífonos
  try {
    const ms = (window as unknown as { CPNNative?: { audioLatencyMs?: () => number } }).CPNNative?.audioLatencyMs?.()
    if (typeof ms === 'number' && ms > 0 && ms < 2000) return ms / 1000
  } catch {}
  if (autoLatency != null) return autoLatency
  autoLatency = 0.1
  try {
    const Ctx = (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext
    if (Ctx) {
      const ctx = new Ctx({ latencyHint: 'playback' })
      const read = () => {
        const out = (ctx as AudioContext & { outputLatency?: number }).outputLatency ?? 0
        const total = out + (ctx.baseLatency ?? 0)
        if (total > 0.01 && total < 1) autoLatency = total
      }
      read()
      // Algunos teléfonos lo informan recién con el sistema de audio andando
      ctx.resume?.().then(() => setTimeout(() => {
        read()
        ctx.close().catch(() => {})
      }, 300)).catch(() => ctx.close().catch(() => {}))
    }
  } catch {}
  return autoLatency
}

/** Ajuste de la persona (milisegundos; + = la imagen va más atrasada) */
export function userOffsetMs(): number {
  try {
    const n = Number(localStorage.getItem(KEY))
    return isFinite(n) ? Math.max(-1000, Math.min(1000, n)) : 0
  } catch {
    return 0
  }
}

export function setUserOffsetMs(ms: number) {
  try {
    localStorage.setItem(KEY, String(Math.round(Math.max(-1000, Math.min(1000, ms)))))
  } catch {}
  window.dispatchEvent(new Event(AV_EVENT))
}

/** Lo que la imagen va detrás del «segundo» del audio (segundos) */
export function videoLag(): number {
  return audioLatency() + userOffsetMs() / 1000
}
