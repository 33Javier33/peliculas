'use client'

import { isNativeApp, nativePrefetch, nativePrefetchLater } from '@/lib/native'
import { ytIdOf } from '@/lib/pip'

// Preparar canciones antes de tocarlas (como Spotify): al ver resultados, al pasar el mouse o al
// apoyar el dedo, el audio se busca y (en la app) se descarga su comienzo. Al tocarla, suena ya.
// - App: lo hace el teléfono (no gasta servidor).
// - Navegador: solo con intención (mouse encima o toque): se deja lista la dirección del audio.

type T = { id: string; audioUrl?: string; streamUrl?: string; pending?: unknown }

const idOf = (t: T | string): string | null => {
  if (typeof t === 'string') return /^[A-Za-z0-9_-]{11}$/.test(t) ? t : null
  if (t.streamUrl || t.pending) return null
  return ytIdOf(t)
}

function connection() {
  const c = (navigator as unknown as { connection?: { saveData?: boolean; type?: string; effectiveType?: string } }).connection
  return { save: !!c?.saveData, cellular: c?.type === 'cellular' || c?.effectiveType === '3g' || c?.effectiveType === '2g' }
}

/** Una canción a punto de tocarse (dedo apoyado o mouse encima) */
export function warmTrack(t: T | string) {
  if (typeof window === 'undefined') return
  const id = idOf(t)
  if (!id || connection().save) return
  if (isNativeApp()) {
    nativePrefetch(id)
    return
  }
  window.dispatchEvent(new CustomEvent('cpn-warm', { detail: id }))
}

/** Los primeros resultados que se ven (solo en la app: el teléfono prepara su comienzo en fila) */
export function warmList(list: (T | string)[], n = 4) {
  if (typeof window === 'undefined' || !isNativeApp()) return
  const { save, cellular } = connection()
  if (save) return
  const ids = list.map(idOf).filter((x): x is string => !!x).slice(0, cellular ? 1 : n)
  ids.forEach((id, i) => (i === 0 ? nativePrefetch(id) : nativePrefetchLater(id)))
}

/** Mouse encima un momento (computador): se prepara; si se va enseguida, no */
export function hoverWarm(t: T | string) {
  let timer: ReturnType<typeof setTimeout> | null = null
  return {
    onPointerEnter: (e: React.PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      timer = setTimeout(() => warmTrack(t), 150)
    },
    onPointerLeave: () => {
      if (timer) clearTimeout(timer)
    },
    onPointerDown: () => warmTrack(t),
  }
}
