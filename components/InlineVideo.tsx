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
  controlRef?: MutableRefObject<((func: 'playVideo' | 'pauseVideo' | 'seekTo', at?: number) => void) | null>
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
    controlRef.current = (func, at) => command(func, func === 'seekTo' ? [at ?? 0, true] : [])
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
    // Segundo exacto del video: YouTube avisa cada tanto; entre avisos se calcula con el reloj
    // (así el empalme con la canción no queda atrasado por lo que tardó el aviso)
    let sample = { t: startAt, at: performance.now() }
    let playing = false
    let rate = 1
    const now = () => (playing ? sample.t + ((performance.now() - sample.at) / 1000) * rate : sample.t)
    const tick = setInterval(() => {
      timeRef.current = now()
    }, 50)
    const setRate = (r: number) => {
      if (r === rate) return
      sample = { t: now(), at: performance.now() }
      rate = r
      command('setPlaybackRate', [r])
    }

    // Empalme: el video empieza en silencio y se pone parejo con la canción (los saltos grandes con
    // un salto, los chicos acelerando o frenando un poco el video). Recién parejo toma el sonido.
    let align: ReturnType<typeof setInterval> | null = null
    let alignStart = 0
    let lastAction = 0
    let seeks = 0
    let lead = 0.35 // lo que tarda el video en seguir después de un salto (se va midiendo)
    let seekFrom: number | null = null
    let goodChecks = 0
    const handoff = () => {
      if (align) clearInterval(align)
      align = null
      setRate(1)
      if (started.current || failedNow) return
      started.current = true
      command('unMute')
      cb.current.onPlaying()
    }
    const startAlign = () => {
      if (align || started.current) return
      alignStart = performance.now()
      align = setInterval(() => {
        const target = cb.current.syncTo?.()
        if (typeof target !== 'number' || performance.now() - alignStart > 7000) return handoff()
        // Medir solo con un aviso fresco del video después del último ajuste
        if (!playing || sample.at < lastAction + 200) return
        const diff = now() - target
        if (seekFrom !== null) {
          // Lo que quedó corrido tras el salto: corrige cuánto adelantar el próximo
          lead = Math.min(2, Math.max(0, lead - diff))
          seekFrom = null
        }
        if (Math.abs(diff) <= 0.07) {
          setRate(1)
          if (++goodChecks >= 2) handoff()
          return
        }
        goodChecks = 0
        if ((Math.abs(diff) > 1.2 || performance.now() - alignStart > 4000) && seeks < 3) {
          seeks++
          setRate(1)
          lastAction = performance.now()
          seekFrom = diff
          syncing.current = true
          command('seekTo', [target + lead, true])
          return
        }
        // Diferencia chica: el video acelera o frena un poco hasta quedar parejo
        setRate(diff < 0 ? (diff < -0.4 ? 1.5 : 1.25) : diff > 0.4 ? 0.5 : 0.75)
      }, 60)
    }

    const onMessage = (e: MessageEvent) => {
      if (!/^https:\/\/(www\.)?youtube(-nocookie)?\.com$/.test(e.origin) || e.source !== iframeRef.current?.contentWindow) return
      let data: { event?: string; info?: { currentTime?: number; playerState?: number; currentTimeLastUpdated_?: number; playbackRate?: number } | number }
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
        if (align) clearInterval(align)
        setFailed(true)
        cb.current.onUnavailable?.()
        return
      }
      const info = typeof data.info === 'object' && data.info ? data.info : undefined
      if (!info) return
      if (info.playerState === 1 || info.playerState === 3 || (info.currentTime ?? 0) > 0.5) active = true
      if (typeof info.playbackRate === 'number' && info.playbackRate > 0) rate = info.playbackRate
      if (typeof info.playerState === 'number') {
        const wasPlaying = playing
        if (wasPlaying && info.playerState !== 1) sample = { t: now(), at: performance.now() }
        playing = info.playerState === 1
        if (!wasPlaying && playing) sample = { t: sample.t, at: performance.now() }
      }
      if (typeof info.currentTime === 'number') {
        // El aviso dice cuándo se midió: se descuenta lo que tardó en llegar
        let age = 0
        if (typeof info.currentTimeLastUpdated_ === 'number') age = Math.min(1, Math.max(0, Date.now() / 1000 - info.currentTimeLastUpdated_))
        sample = { t: info.currentTime + (playing ? age * rate : 0), at: performance.now() }
        timeRef.current = now()
      }
      if (info.playerState === 1 && !started.current) {
        if (cb.current.syncTo) startAlign()
        else handoff()
        return
      }
      // Pausa o play desde los controles del propio video
      if (started.current && (info.playerState === 1 || info.playerState === 2)) cb.current.onState?.(info.playerState === 1)
      if (info.playerState === 0) cb.current.onEnded()
    }
    window.addEventListener('message', onMessage)
    // Si el video carga pero no avisa que arrancó, a los 9 s se le da el sonido igual. Si no cargó
    // nada (no disponible), la canción NO se apaga
    const t = setTimeout(() => {
      if (started.current || failedNow || !active || align) return
      handoff()
    }, 9000)
    return () => {
      window.removeEventListener('message', onMessage)
      clearTimeout(t)
      clearInterval(tick)
      if (align) clearInterval(align)
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
