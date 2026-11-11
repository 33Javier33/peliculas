'use client'

// Ventana flotante del video (Chrome y Edge: Document Picture-in-Picture). Vive fuera del reproductor:
// cerrar el video de la página NO la cierra. Solo se cierra con su X, al poner otro video flotante,
// con «Traer de vuelta», o al cerrar el navegador.
interface Floating {
  win: Window
  videoId: string
  time: number
  onClosed?: (sec: number) => void
}

let current: Floating | null = null

export const floatSupported = () => typeof window !== 'undefined' && 'documentPictureInPicture' in window

/** Id del video que está en la ventana flotante (o null) */
export const floatingId = () => current?.videoId ?? null

/** Abre el video en la ventana flotante. Si ya había otro, se reemplaza. `onClosed` recibe el segundo al volver */
export async function openFloat(opts: { videoId: string; title: string; start: number; origin: string; onClosed?: (sec: number) => void }): Promise<boolean> {
  const dpip = (window as unknown as { documentPictureInPicture?: { requestWindow: (o: { width: number; height: number }) => Promise<Window> } }).documentPictureInPicture
  if (!dpip) return false
  if (current) current.win.close()
  const win = await dpip.requestWindow({ width: 480, height: 290 })
  win.document.title = opts.title
  win.document.body.style.margin = '0'
  win.document.body.style.background = '#000'
  const t = Math.floor(opts.start || 0)
  const f = win.document.createElement('iframe')
  f.src = `https://www.youtube-nocookie.com/embed/${opts.videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1&hl=es${t > 1 ? `&start=${t}` : ''}&origin=${encodeURIComponent(opts.origin)}`
  f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'
  f.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0'
  win.document.body.appendChild(f)
  const entry: Floating = { win, videoId: opts.videoId, time: t, onClosed: opts.onClosed }
  current = entry
  // Lo que va diciendo el video flotante (para volver al mismo segundo)
  win.addEventListener('message', (e: MessageEvent) => {
    if (e.source !== f.contentWindow) return
    try {
      const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
      if (typeof d?.info?.currentTime === 'number') entry.time = d.info.currentTime
    } catch {}
  })
  win.addEventListener('pagehide', () => {
    if (current !== entry) return // ya fue reemplazada por otro video
    current = null
    entry.onClosed?.(entry.time)
  })
  return true
}

/** Cierra la ventana flotante (vuelve el video a la página, si la página lo espera) */
export function closeFloat() {
  current?.win.close()
}
