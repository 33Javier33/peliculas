'use client'

import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { Maximize2, Loader2, PictureInPicture2, X, Music2 } from 'lucide-react'

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
  onUnavailable,
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
  /** YouTube no deja ver este video aquí: la canción tiene que seguir sonando */
  onUnavailable?: () => void
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const started = useRef(false)
  const syncing = useRef(false)
  const [failed, setFailed] = useState(false)
  const cb = useRef({ onPlaying, onEnded, onState, syncTo, onUnavailable })
  cb.current = { onPlaying, onEnded, onState, syncTo, onUnavailable }
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
    setFailed(false)
    let failedNow = false
    // ¿El video de verdad está cargando o sonando? (si YouTube no lo deja ver, nunca avanza)
    let active = false
    const onMessage = (e: MessageEvent) => {
      if (!/^https:\/\/(www\.)?youtube(-nocookie)?\.com$/.test(e.origin) || e.source !== iframeRef.current?.contentWindow) return
      let data: { event?: string; info?: { currentTime?: number; playerState?: number } | number }
      try {
        data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
      } catch {
        return
      }
      // Video bloqueado o no disponible aquí (derechos, inserción desactivada…): no se le da el
      // sonido; la canción sigue sonando y se avisa en el lugar del video
      if (data.event === 'onError') {
        if (failedNow) return
        failedNow = true
        setFailed(true)
        cb.current.onUnavailable?.()
        return
      }
      const info = typeof data.info === 'object' && data.info ? data.info : undefined
      if (info?.playerState === 1 || info?.playerState === 3 || (info?.currentTime ?? 0) > 0.5) active = true
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
    // Si el video carga pero no avisa que arrancó, a los 8 s se le da el sonido igual. Si no cargó
    // nada (no disponible), la canción NO se apaga
    const t = setTimeout(() => {
      if (started.current || failedNow || !active) return
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
      {failed && (
        <div className="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-2 px-6 text-center bg-gradient-to-br from-violet-950 via-black to-black">
          <span className="w-11 h-11 rounded-full bg-violet-500/25 flex items-center justify-center">
            <Music2 className="w-5 h-5 text-violet-200" />
          </span>
          <p className="text-white text-sm font-semibold">Este video no se puede ver aquí</p>
          <p className="text-slate-400 text-xs">La canción sigue sonando. La siguiente vuelve a mostrar su video.</p>
        </div>
      )}
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
        {onFloat && !failed && (
          <button
            onClick={onFloat}
            className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-md text-white flex items-center justify-center"
            aria-label="Ventana flotante"
            title="Ventana flotante (sigue mientras usas la app)"
          >
            <PictureInPicture2 className="w-5 h-5" />
          </button>
        )}
        {!failed && (
        <button
          onClick={onExpand}
          className={`${onCloseFloat ? 'w-8 h-8' : 'w-10 h-10'} rounded-full bg-black/60 backdrop-blur-md text-white flex items-center justify-center`}
          aria-label="Agrandar el video"
          title="Agrandar"
        >
          <Maximize2 className={onCloseFloat ? 'w-4 h-4' : 'w-5 h-5'} />
        </button>
        )}
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
