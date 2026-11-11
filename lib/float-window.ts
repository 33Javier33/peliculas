'use client'

// Ventana flotante del video: una ventana aparte del navegador (public/float.html, del propio sitio),
// que sigue abierta aunque navegues por la página o vuelvas atrás. Se cierra con su X, al poner otro
// video (lo reemplaza), con «Traer de vuelta», o al cerrar el navegador.
const CHANNEL = 'cpn-float'
const WINDOW_NAME = 'cpn-float-video'

interface Floating {
  videoId: string
  time: number
  win: Window | null
  onClosed?: (sec: number) => void
}

let current: Floating | null = null
let channel: BroadcastChannel | null = null

type Msg = { type: 'state' | 'closed' | 'back'; vid: string; t?: number; playing?: boolean }

function getChannel() {
  if (!channel && typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(CHANNEL)
    channel.onmessage = (e: MessageEvent<Msg>) => {
      const d = e.data
      if (!current || !d || d.vid !== current.videoId) return
      if (d.type === 'state') {
        current.time = d.t ?? current.time
        return
      }
      // Cerrada con su X o con «Volver a la página»: el video vuelve a la página en el mismo segundo
      const c = current
      current = null
      c.onClosed?.(d.t ?? c.time)
    }
  }
  return channel
}

export const floatSupported = () => typeof window !== 'undefined' && typeof window.open === 'function'

/** Id del video que está en la ventana flotante (o null) */
export function floatingId(): string | null {
  return current && current.win && !current.win.closed ? current.videoId : null
}

/** Abre el video en la ventana flotante. Si ya había otro, esa ventana cambia de video. */
export function openFloat(opts: { videoId: string; start: number; onClosed?: (sec: number) => void }): boolean {
  const t = Math.max(0, Math.floor(opts.start || 0))
  const w = window.open(`/float.html?v=${encodeURIComponent(opts.videoId)}&t=${t}`, WINDOW_NAME, 'popup=yes,width=520,height=320,left=60,top=60')
  if (!w) return false
  getChannel()
  // Si había otro video, ya no le avisamos a su dueño (no debe volver a la página)
  const entry: Floating = { videoId: opts.videoId, time: t, win: w, onClosed: opts.onClosed }
  current = entry
  // Por si se cerró sin mensaje: se detecta y el video vuelve a la página
  const iv = window.setInterval(() => {
    if (current !== entry) return window.clearInterval(iv)
    if (w.closed) {
      window.clearInterval(iv)
      current = null
      entry.onClosed?.(entry.time)
    }
  }, 700)
  return true
}

/** Pide a la ventana flotante que se cierre (el video vuelve a la página) */
export function closeFloat() {
  const c = current
  if (!c) return
  channel?.postMessage({ type: 'cmd', vid: c.videoId, func: 'close' })
}

/** Manda una orden a la ventana flotante (play, pause, seekTo…) */
export function floatCommand(func: string, args: unknown[] = []) {
  if (!current) return
  channel?.postMessage({ type: 'cmd', vid: current.videoId, func, args })
}
