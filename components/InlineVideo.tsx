'use client'

import { useEffect, useRef, type MutableRefObject } from 'react'
import { Maximize2, Loader2, PictureInPicture2, X } from 'lucide-react'

// Video de la canción dentro del reproductor grande (en el lugar de la carátula), como en Spotify.
// Empieza en silencio mientras carga y recién al sonar se apaga la canción y el video toma el
// sonido (sin silencio en medio). «Agrandar» lo abre en la pantalla de video.
export default function InlineVideo({
  videoId,
  startAt,
  timeRef,
  onPlaying,
  onEnded,
  onExpand,
  onState,
  controlRef,
  syncTo,
  onFloat,
  onCloseFloat,
}: {
  videoId: string
  startAt: number
  /** Segundo en que va el video (para seguir con la canción desde ahí) */
  timeRef: MutableRefObject<number>
  onPlaying: () => void
  onEnded: () => void
  onExpand: () => void
  /** Se pausó o siguió desde los controles del video (para que el reproductor haga lo mismo) */
  onState?: (playing: boolean) => void
  /** Para mandar órdenes al video desde el reproductor (play / pausa) */
  controlRef?: MutableRefObject<((func: 'playVideo' | 'pauseVideo') => void) | null>
  /** Segundo en que va la canción: el video se pone parejo con ella antes de tomar el sonido */
  syncTo?: () => number
  /** Pasar a ventana flotante (sobre la app) */
  onFloat?: () => void
  /** En la ventana flotante: cerrarla (la música sigue) */
  onCloseFloat?: () => void
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const started = useRef(false)
  const syncing = useRef(false)
  const cb = useRef({ onPlaying, onEnded, onState, syncTo })
  cb.current = { onPlaying, onEnded, onState, syncTo }
  const command = (func: string, args: unknown[] = []) => iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*')
  useEffect(() => {
    if (!controlRef) return
    controlRef.current = (func) => command(func)
    return () => {
      controlRef.current = null
    }
  }, [controlRef])
  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  useEffect(() => {
    timeRef.current = startAt
    started.current = false
    syncing.current = false
    const onMessage = (e: MessageEvent) => {
      if (!/^https:\/\/(www\.)?youtube(-nocookie)?\.com$/.test(e.origin) || e.source !== iframeRef.current?.contentWindow) return
      let data: { event?: string; info?: { currentTime?: number; playerState?: number } }
      try {
        data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
      } catch {
        return
      }
      const info = data.info
      if (typeof info?.currentTime === 'number') timeRef.current = info.currentTime
      if (info?.playerState === 1 && !started.current) {
        // Parejo con la canción: si el video quedó atrás o adelante (lo que tardó en cargar), se
        // mueve al segundo en que va la canción y recién ahí toma el sonido
        const target = cb.current.syncTo?.()
        if (typeof target === 'number' && !syncing.current && Math.abs(target - timeRef.current) > 0.35) {
          syncing.current = true
          command('seekTo', [target + 0.15, true])
          return
        }
        started.current = true
        command('unMute')
        cb.current.onPlaying()
        return
      }
      // Pausa o play desde los controles del propio video
      if (started.current && (info?.playerState === 1 || info?.playerState === 2)) cb.current.onState?.(info.playerState === 1)
      if (info?.playerState === 0) cb.current.onEnded()
    }
    window.addEventListener('message', onMessage)
    // Si el video no avisa que arrancó, a los 8 s se le da el sonido igual
    const t = setTimeout(() => {
      if (started.current) return
      started.current = true
      iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'unMute', args: [] }), '*')
      cb.current.onPlaying()
    }, 8000)
    return () => {
      window.removeEventListener('message', onMessage)
      clearTimeout(t)
    }
  }, [videoId, startAt, timeRef])

  const onLoad = () => {
    const win = iframeRef.current?.contentWindow
    if (!win) return
    const send = () => win.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*')
    send()
    setTimeout(send, 1000)
    setTimeout(send, 3000)
  }

  return (
    <div className="absolute inset-0 bg-black">
      <span className="absolute inset-0 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-white/60 animate-spin" />
      </span>
      <iframe
        ref={iframeRef}
        key={videoId}
        src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1&enablejsapi=1&hl=es${startAt > 1 ? `&start=${Math.floor(startAt)}` : ''}&origin=${encodeURIComponent(origin)}`}
        title="Video de la canción"
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        onLoad={onLoad}
        className="absolute inset-0 w-full h-full"
      />
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5">
        {onFloat && (
          <button
            onClick={onFloat}
            className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-md text-white flex items-center justify-center"
            aria-label="Ventana flotante"
            title="Ventana flotante (sigue mientras usas la app)"
          >
            <PictureInPicture2 className="w-5 h-5" />
          </button>
        )}
        <button
          onClick={onExpand}
          className={`${onCloseFloat ? 'w-8 h-8' : 'w-10 h-10'} rounded-full bg-black/60 backdrop-blur-md text-white flex items-center justify-center`}
          aria-label="Agrandar el video"
          title="Agrandar"
        >
          <Maximize2 className={onCloseFloat ? 'w-4 h-4' : 'w-5 h-5'} />
        </button>
        {onCloseFloat && (
          <button
            onClick={onCloseFloat}
            className="w-8 h-8 rounded-full bg-black/60 backdrop-blur-md text-white flex items-center justify-center"
            aria-label="Cerrar la ventana (la música sigue)"
            title="Cerrar la ventana (la música sigue)"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}
