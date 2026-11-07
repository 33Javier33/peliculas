// App de Android: ventana flotante (imagen en imagen) con el video. Al entrar en la ventanita la
// página puede quedar "oculta" para el navegador, pero el video SÍ se ve: en ese caso no hay que
// pasar al audio (antes se cambiaba y la ventanita quedaba en negro).
export const PIP_EVENT = 'cpn-pip-change'

type W = Window & { __cpnPipSoon?: number }

/** ¿Está (o está por abrirse) la ventana flotante con el video? */
export function pipNow(): boolean {
  if (typeof document === 'undefined') return false
  if (document.documentElement.classList.contains('cpn-pip')) return true
  const soon = (window as W).__cpnPipSoon ?? 0
  return Date.now() - soon < 2500
}

let recheck: ReturnType<typeof setTimeout> | undefined

/** La app de verdad no se ve (pantalla bloqueada o en segundo plano sin ventana flotante) */
export function appHidden(): boolean {
  if (typeof document === 'undefined' || document.visibilityState !== 'hidden') return false
  if (document.documentElement.classList.contains('cpn-pip')) return false
  const soon = (window as W).__cpnPipSoon ?? 0
  const left = 2500 - (Date.now() - soon)
  if (left > 0) {
    // Se esperaba la ventanita, pero puede que el teléfono no la abra (desactivada en Ajustes, o
    // no hay espacio): si a los 2,5 s no se abrió, los reproductores vuelven a mirar y pasan al
    // audio (antes la música quedaba detenida)
    clearTimeout(recheck)
    recheck = setTimeout(() => window.dispatchEvent(new Event(PIP_EVENT)), left + 100)
    return false
  }
  return true
}

/** ID del video de YouTube de una canción (también si se convirtió a audio o está descargada) */
export function ytIdOf(t: { id: string; audioUrl?: string; description?: string } | null | undefined): string | null {
  if (!t) return null
  if (/^[A-Za-z0-9_-]{11}$/.test(t.id)) return t.id
  const a = t.id.match(/^yta-([A-Za-z0-9_-]{11})$/)?.[1]
  if (a) return a
  const s = t.audioUrl?.match(/\/api\/stream\?id=([A-Za-z0-9_-]{11})/)?.[1]
  if (s) return s
  return t.description?.match(/youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})/)?.[1] ?? null
}
