'use client'

import { useEffect, useCallback, useMemo, useRef, useState } from 'react'
import { openFloat, closeFloat, floatingId } from '@/lib/float-window'
import { isPhoneScreen, openMini } from '@/store/miniStore'
import { Headphones, MonitorPlay, X, ExternalLink, TvMinimalPlay, Heart, Clock3, RefreshCw, Loader2, AlertCircle, Settings2, Cast, MonitorSmartphone, SkipForward, MessageCircle, PictureInPicture2, ChevronDown, Play, Pause, RotateCcw, RotateCw, Maximize } from 'lucide-react'
import SocialPanel from '@/components/SocialPanel'
import CastButton, { loadCast, useCastStore } from '@/components/CastButton'
import { appHidden, PIP_EVENT, ytIdOf } from '@/lib/pip'
import { useMusicStore } from '@/store/musicStore'
import { isNativeApp, nativePrefetch } from '@/lib/native'
import { cacheYtAudio, isDesktop } from '@/lib/yt-audio-cache'
import { nativeCast, nativeCastAvailable, openMirroring, canOpenMirroring, nativeCastControl, castKind, castYtId, tvSync } from '@/lib/native-cast'
import VideoAudioDownload from '@/components/VideoAudioDownload'
import { useVideoStore } from '@/store/videoStore'
import { tvTakeVideo } from '@/lib/video-handoff'

interface YoutubePlayerProps {
  videoId: string
  title: string
  channelTitle: string
  /** Al cerrar recibe el segundo en que iba el video (para seguir la música desde ahí) */
  onClose: (currentTime?: number) => void
  /** Segundo desde el que empieza el video (p. ej. donde iba la música) */
  startTime?: number
  liked?: boolean
  later?: boolean
  onToggleLike?: () => void
  onToggleLater?: () => void
  /** Videos musicales: al terminar (o al tocar «Siguiente») pasa al siguiente */
  onNext?: () => void
  /** Título del que viene a continuación (se muestra al lado de «Siguiente») */
  upNext?: string
  /** Video de la canción que suena (como en Spotify): botón «Canción» para volver a escucharla */
  songToggle?: boolean
  /** «Canción» (si no se da, se usa onClose) */
  onSong?: (currentTime?: number) => void
  /** Al terminar pasa solo al siguiente (si no, ofrece «Ver siguiente»). Por defecto sí */
  autoNext?: boolean
  /** Interruptor «Reproducción automática» (películas y videos que no son música) */
  onToggleAutoplay?: () => void
  /** Con el teléfono bloqueado la música pasó a otra canción: al volver no se retoma este video */
  onTrackChange?: () => void
  /** Lista de videos (para mostrar «A continuación» bajo el video) */
  list?: { id: string; title: string; channel?: string }[]
  /** Elegir otro video de la lista */
  onPick?: (v: { id: string; title: string; channel?: string }) => void
}

interface VideoCandidate {
  url: string
  quality: number
}

// Calidades que se pueden pedir a YouTube (vq). "Máxima" pide la más alta que tenga el video.
const QUALITIES = [
  { id: 'highres', label: 'Máxima (4K si hay)' },
  { id: 'hd1080', label: '1080p' },
  { id: 'hd720', label: '720p' },
  { id: 'large', label: '480p' },
  { id: 'medium', label: '360p' },
  { id: 'auto', label: 'Automática' },
]
const QUALITY_HEIGHT: Record<string, number> = { highres: 9999, hd1080: 1080, hd720: 720, large: 480, medium: 360, auto: 9999 }

// Si YouTube no confirma que el reproductor cargó en este tiempo, se ofrece otra fuente
const LOAD_TIMEOUT_MS = 12000

/**
 * Reproductor de la sección Videos. Usa el reproductor de YouTube y, si el video no se
 * puede ver insertado (el dueño lo bloqueó fuera de YouTube, restricción por país…),
 * cambia solo a una fuente alternativa (Piped/Invidious) con un <video> propio.
 */
export default function YoutubePlayer({
  videoId,
  title,
  channelTitle,
  onClose,
  startTime = 0,
  liked,
  later,
  onToggleLike,
  onToggleLater,
  onNext,
  upNext,
  songToggle,
  onSong,
  autoNext = true,
  onToggleAutoplay,
  onTrackChange,
  list,
  onPick,
}: YoutubePlayerProps) {
  const onTrackChangeRef = useRef(onTrackChange)
  onTrackChangeRef.current = onTrackChange
  // Terminó y no sigue solo: se ofrece «Ver siguiente»
  const [ended, setEnded] = useState(false)
  const autoNextRef = useRef(autoNext)
  autoNextRef.current = autoNext
  const onEndRef = useRef<() => void>(() => {})
  onEndRef.current = () => {
    if (!onNextRef.current) return
    if (autoNextRef.current) onNextRef.current()
    else setEnded(true)
  }
  const onNextRef = useRef(onNext)
  onNextRef.current = onNext
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [mode, setMode] = useState<'youtube' | 'alt'>('youtube')
  const [ytReady, setYtReady] = useState(false)
  const [ytPlaying, setYtPlaying] = useState(false)
  const [ytSlow, setYtSlow] = useState(false)
  const [pos, setPos] = useState(0)
  const [len, setLen] = useState(0)
  const [altPlaying, setAltPlaying] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  // ¿Este video se ve en la TV? (video suelto enviado desde aquí, o la canción que suena en la TV)
  const tvDevice = useCastStore((st) => st.device)
  const currentSongId = useMusicStore((st) => st.queue[st.currentIndex]?.id)
  const [tvTick, setTvTick] = useState(0)
  const castHere =
    !!tvDevice && ((castKind() === 'video' && castYtId() === videoId) || (castKind() === 'music' && currentSongId === videoId))
  void tvTick
  const castHereRef = useRef(castHere)
  castHereRef.current = castHere
  const [tvPlaying, setTvPlaying] = useState(true)
  // Al abrir un video con la TV conectada: el video va a la TV (el teléfono no suena) y queda en
  // la música (barra, canción/video y el próximo de la lista, todo junto)
  const castOnOpenRef = useRef(!!useCastStore.getState().device && castKind() !== null)
  const listRef = useRef(list)
  listRef.current = list
  const tvTake = (video: boolean, position: number, reload: boolean) =>
    tvTakeVideo(listRef.current ?? [], { id: videoId, title, channel: channelTitle }, position, { video, reload })
  useEffect(() => {
    if (!castOnOpenRef.current || !nativeCastAvailable()) return
    const st = useMusicStore.getState()
    if (castKind() === 'music' && st.queue[st.currentIndex]?.id === videoId) return
    if (castKind() === 'video' && castYtId() === videoId) return
    tvTake(true, startTime ?? 0, true)
    setTvTick((n) => n + 1)
  }, [videoId]) // eslint-disable-line react-hooks/exhaustive-deps
  // Video enviado a la TV recién conectada: al empezar pasa a ser parte de la música (sin recargar)
  const adoptPendingRef = useRef(false)
  useEffect(() => {
    const onState = (e: Event) => {
      const st = (e as CustomEvent<string>).detail
      if (!adoptPendingRef.current || castKind() !== 'video' || castYtId() !== videoId) return
      if (st !== 'loading' && st !== 'playing') return
      adoptPendingRef.current = false
      tvTake(true, tvSync.pos || timeRef.current, false)
    }
    window.addEventListener('cpn-cast-state', onState)
    return () => window.removeEventListener('cpn-cast-state', onState)
  }, [videoId]) // eslint-disable-line react-hooks/exhaustive-deps
  // La TV pasó al próximo tema de la cola: esta ventana sigue con ese video
  const wasCastHereRef = useRef(false)
  useEffect(() => {
    if (castHere) {
      wasCastHereRef.current = true
      return
    }
    if (!wasCastHereRef.current || !tvDevice || castKind() !== 'music' || !currentSongId) return
    const hit = listRef.current?.find((x) => x.id === currentSongId)
    if (hit && onPick) onPick(hit)
  }, [castHere, currentSongId, tvDevice, onPick])
  // La línea de tiempo sigue a la TV; al terminar en la TV sigue el próximo video de la lista
  useEffect(() => {
    const iv = window.setInterval(() => {
      setTvTick((n) => n + 1)
      if (!castHereRef.current) return
      setPos(tvSync.pos)
      if (tvSync.dur > 0) setLen(tvSync.dur)
      if (tvSync.playing !== null) setTvPlaying(tvSync.playing)
    }, 1000)
    const onEnded = () => {
      if (castKind() === 'video' && castYtId() === videoId) onNextRef.current?.()
    }
    window.addEventListener('cpn-cast-ended', onEnded)
    return () => {
      window.clearInterval(iv)
      window.removeEventListener('cpn-cast-ended', onEnded)
    }
  }, [videoId])
  useEffect(() => {
    // Ya se ve en la TV: el video de aquí queda en pausa
    if (castHere) iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), '*')
  }, [castHere])
  useEffect(() => {
    setPos(startTime ?? 0)
    setLen(0)
  }, [videoId]) // eslint-disable-line react-hooks/exhaustive-deps
  const [autoSwitched, setAutoSwitched] = useState(false)
  const [alt, setAlt] = useState<{ candidates: VideoCandidate[]; index: number } | null>(null)
  const [altStatus, setAltStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  // Calidad pedida a YouTube (se recuerda). Por defecto la más alta disponible.
  const [quality, setQuality] = useState<string>(() => {
    try {
      return localStorage.getItem('cpn-video-quality') || 'highres'
    } catch {
      return 'highres'
    }
  })
  const [qualityOpen, setQualityOpen] = useState(false)
  // Transmitir a la TV: YouTube no deja enviar sus videos desde otra web; se abre en la app de
  // YouTube (que sí transmite) en el mismo segundo, o se usa la fuente alternativa con Chromecast
  const [castOpen, setCastOpen] = useState(false)
  // Me gusta y comentarios (de la app y de YouTube)
  const [socialOpen, setSocialOpen] = useState(false)
  const altVideoRef = useRef<HTMLVideoElement>(null)
  // Transmitir desde la app: se abre YouTube en la TV (Chromecast / Google TV) y se le indica el video
  const [tvStatus, setTvStatus] = useState<'' | 'connecting' | 'playing' | 'error' | 'unsupported'>('')
  const [tvName, setTvName] = useState('')
  const [tvError, setTvError] = useState('')
  const tvSessionRef = useRef<any>(null) // eslint-disable-line @typescript-eslint/no-explicit-any
  const castToTv = async () => {
    setTvError('')
    // App de Android: la TV se elige en la lista de la app y reproduce el video sola
    if (nativeCastAvailable()) {
      // TV ya conectada: va directo como parte de la música; si no, se elige la TV y al empezar se une
      if (useCastStore.getState().device) tvTake(true, timeRef.current, true)
      else {
        adoptPendingRef.current = true
        nativeCast({ yt: videoId, video: true, title, subtitle: channelTitle, image: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, position: timeRef.current, kind: 'video' })
      }
      iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), '*')
      altVideoRef.current?.pause()
      setCastOpen(false)
      return
    }
    setTvStatus('connecting')
    if (!(await loadCast())) return setTvStatus('unsupported')
    const cast = (window as any).chrome?.cast // eslint-disable-line @typescript-eslint/no-explicit-any
    const NS = 'urn:x-cast:com.google.youtube.mdx'
    const fail = (msg: string) => {
      setTvError(msg)
      setTvStatus('error')
    }
    cast.requestSession(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (session: any) => {
        tvSessionRef.current = session
        setTvName(session.receiver?.friendlyName || 'tu TV')
        let done = false
        const timer = setTimeout(() => !done && fail('La TV no respondió. Prueba de nuevo.'), 15000)
        session.addMessageListener(NS, async (_ns: string, message: string) => {
          let data: { type?: string; data?: { screenId?: string } }
          try {
            data = JSON.parse(message)
          } catch {
            return
          }
          const screenId = data.data?.screenId
          if (done || data.type !== 'mdxSessionStatus' || !screenId) return
          done = true
          clearTimeout(timer)
          try {
            const r = await fetch('/api/yt-cast', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ screenId, videoId, currentTime: timeRef.current }),
            })
            if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error || 'No se pudo enviar')
            setTvStatus('playing')
            // El video sigue en la TV: aquí se pausa
            iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), '*')
            altVideoRef.current?.pause()
          } catch (err) {
            fail((err as Error).message)
          }
        })
        session.sendMessage(NS, { type: 'getMdxSessionStatus' }, () => {}, () => fail('No se pudo hablar con YouTube en la TV'))
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (err: any) => (/cancel/i.test(err?.code || '') ? setTvStatus('') : fail('No se pudo conectar con la TV')),
      new cast.SessionRequest('233637DE') // la app de YouTube del Chromecast / Google TV
    )
  }
  const stopTv = () => {
    try {
      tvSessionRef.current?.stop(() => {}, () => {})
    } catch {}
    tvSessionRef.current = null
    setTvStatus('')
  }
  // Segundo en que va el video (para seguir desde ahí al cambiar la calidad)
  const timeRef = useRef(startTime)
  const [startAt, setStartAt] = useState(Math.floor(startTime))
  // ===== Al bloquear el teléfono el video sigue sonando =====
  // YouTube se detiene con la pantalla bloqueada. Al empezar el video, el teléfono deja listo su
  // audio; al bloquear (o salir de la app) se pausa el video y sigue el audio desde el mismo
  // segundo en el reproductor de música; al volver, el video sigue desde donde iba el audio.
  const ytPlayingRef = useRef(false)
  ytPlayingRef.current = ytPlaying
  // Última vez que el video estaba sonando: el teléfono lo pausa un instante ANTES de avisar que
  // la pantalla se bloqueó; si sonaba hasta hace poco, igual se pasa al audio (la música sigue)
  const lastPlayingAtRef = useRef(0)
  if (ytPlaying) lastPlayingAtRef.current = Date.now()
  const modeRef = useRef(mode)
  modeRef.current = mode
  const handedRef = useRef(false)
  // Volviendo del audio al video: se espera a que el video suene para apagar el audio
  const songToggleRef = useRef(!!songToggle)
  // Abierto desde «Video» con la canción sonando: el video empieza en silencio y, al sonar, se
  // apaga la canción y se le da el sonido (finishSwapBack)
  const swapBackRef = useRef(!!songToggle && useMusicStore.getState().isPlaying)
  const [startMuted] = useState(() => swapBackRef.current)
  const finishSwapBack = () => {
    if (!swapBackRef.current) return
    swapBackRef.current = false
    useMusicStore.getState().setIsPlaying(false)
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'unMute', args: [] }), '*')
    if (altVideoRef.current) altVideoRef.current.muted = false
  }
  const finishSwapBackRef = useRef(finishSwapBack)
  finishSwapBackRef.current = finishSwapBack
  // Si el video no avisa que arrancó, a los 8 s se apaga la canción igual
  useEffect(() => {
    if (!swapBackRef.current) return
    const t = setTimeout(() => finishSwapBackRef.current(), 8000)
    return () => clearTimeout(t)
  }, [])
  useEffect(() => {
    if (!ytPlaying) return
    // App de Android: el teléfono deja listo su audio. Web: el audio del video se guarda en el
    // dispositivo (al minimizar o bloquear sigue desde esa copia, como en la app)
    if (isNativeApp()) nativePrefetch(videoId)
    else cacheYtAudio(videoId)
  }, [ytPlaying, videoId])
  useEffect(() => {
    // En el computador los videos siguen sonando solos al minimizar o cambiar de pestaña: no se
    // cambia nada. En el teléfono (app o navegador) se pasa al audio al bloquear o salir.
    if (!isNativeApp() && isDesktop()) return
    const command = (func: string, args: unknown[] = []) =>
      iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*')
    const onVis = () => {
      // Se está viendo en la TV: al bloquear o salir no se cambia nada
      if (castHereRef.current) return
      const st = useMusicStore.getState()
      if (appHidden()) {
        const alt = altVideoRef.current
        const playing = modeRef.current === 'youtube' ? ytPlayingRef.current || Date.now() - lastPlayingAtRef.current < 2500 : !!alt && (!alt.paused || Date.now() - lastPlayingAtRef.current < 2500)
        if (!playing || handedRef.current) return
        handedRef.current = true
        const t = Math.floor(timeRef.current)
        command('pauseVideo')
        alt?.pause()
        const track = { id: videoId, title, channelTitle, thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, publishedAt: '', description: '', startAt: t, forceAudio: true }
        // Suena a continuación en la cola (sin borrar lo que había) desde ese segundo
        const cur = st.queue[st.currentIndex]
        const el = Array.from(document.querySelectorAll('audio')).find((a) => a.src && a.readyState > 0)
        if (ytIdOf(cur) === videoId && st.isVisible && el) {
          el.currentTime = t
          el.play().catch(() => {})
        } else if (ytIdOf(cur) === videoId && st.isVisible) {
          useMusicStore.setState({ queue: st.queue.map((x, i) => (i === st.currentIndex ? { ...x, startAt: t, forceAudio: true } : x)) })
          st.playIndex(st.currentIndex)
        } else {
          st.enqueue([track], true)
          const s2 = useMusicStore.getState()
          if (s2.queue[s2.currentIndex]?.id !== videoId) s2.playNext()
        }
        useMusicStore.getState().setIsPlaying(true)
      } else if (handedRef.current) {
        handedRef.current = false
        // Mientras estaba bloqueado terminó y la música siguió con otra canción: no se vuelve al
        // video anterior (quedaba sonando lo que ya había terminado)
        const now = st.queue[st.currentIndex]
        if (ytIdOf(now) !== videoId) {
          if (onTrackChangeRef.current) onTrackChangeRef.current()
          return
        }
        // Donde iba el audio → el video sigue desde ahí. El audio sigue sonando hasta que el video
        // de verdad arranca (sin silencio en medio): el video empieza silenciado y al sonar se
        // apaga el audio y se le devuelve el sonido. (Se adelanta un poco lo que tarda en cargar)
        const audio = Array.from(document.querySelectorAll('audio')).find((a) => a.src && a.currentTime > 0)
        const cur = st.queue[st.currentIndex]
        const t = ytIdOf(cur) === videoId && audio ? audio.currentTime + 0.8 : timeRef.current
        timeRef.current = t
        swapBackRef.current = true
        if (modeRef.current === 'youtube') {
          command('mute')
          command('seekTo', [t, true])
          command('playVideo')
        } else if (altVideoRef.current) {
          altVideoRef.current.muted = true
          altVideoRef.current.currentTime = t
          altVideoRef.current.play().catch(() => {})
        }
        // Por si el video no avisa que arrancó: a los 4 s se termina el cambio igual
        setTimeout(finishSwapBack, 4000)
      }
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener(PIP_EVENT, onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener(PIP_EVENT, onVis)
    }
  }, [videoId, title, channelTitle])

  const chooseQuality = (q: string) => {
    setQualityOpen(false)
    if (q === quality) return
    try {
      localStorage.setItem('cpn-video-quality', q)
    } catch {}
    setStartAt(Math.floor(timeRef.current))
    setQuality(q)
  }

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose(timeRef.current)
    },
    [onClose]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    // El video y la música no suenan a la vez. Desde «Video» del reproductor la canción sigue
    // sonando hasta que el video de verdad arranca (sin silencio mientras carga)
    if (!songToggleRef.current) useMusicStore.getState().setIsPlaying(false)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [handleKeyDown])

  const switchToAlt = useCallback((automatic: boolean) => {
    setAutoSwitched(automatic)
    setMode('alt')
  }, [])

  // Mensajes del reproductor de YouTube: "listo" o "error" (video no insertable, eliminado…)
  useEffect(() => {
    if (mode !== 'youtube') return
    setYtReady(false)
    setYtSlow(false)
    const onMessage = (e: MessageEvent) => {
      if (!/^https:\/\/(www\.)?youtube(-nocookie)?\.com$/.test(e.origin)) return
      let data: { event?: string; info?: unknown }
      try {
        data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
      } catch {
        return
      }
      if (data.event === 'onReady' || data.event === 'initialDelivery' || data.event === 'infoDelivery') setYtReady(true)
      const info = data.info as { currentTime?: number; playerState?: number; duration?: number } | undefined
      if (typeof info?.currentTime === 'number') {
        timeRef.current = info.currentTime
        setPos(info.currentTime)
      }
      if (typeof info?.duration === 'number' && info.duration > 0) setLen(info.duration)
      // 1 = reproduciendo (para la ventana flotante de la app de Android)
      if (typeof info?.playerState === 'number') {
        if (info.playerState === 1 || ytPlayingRef.current) lastPlayingAtRef.current = Date.now()
        setYtPlaying(info.playerState === 1)
      }
      // Ya suena el video al volver del audio: se apaga el audio y el video recupera el sonido
      if (info?.playerState === 1) finishSwapBackRef.current()
      // 0 = terminó: los videos musicales siguen con el próximo
      if (info?.playerState === 0) onEndRef.current()
      else if (info?.playerState === 1) setEnded(false)
      if (data.event === 'onError') switchToAlt(true)
    }
    window.addEventListener('message', onMessage)
    const slow = setTimeout(() => setYtSlow(true), LOAD_TIMEOUT_MS)
    return () => {
      window.removeEventListener('message', onMessage)
      clearTimeout(slow)
    }
  }, [mode, videoId, switchToAlt])

  // Pide al iframe que avise de sus eventos (API de YouTube vía postMessage)
  const handleIframeLoad = () => {
    const win = iframeRef.current?.contentWindow
    if (!win) return
    const send = () => {
      win.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*')
      // Pide la calidad elegida (YouTube la respeta si el video la tiene y la conexión alcanza)
      if (quality !== 'auto') win.postMessage(JSON.stringify({ event: 'command', func: 'setPlaybackQuality', args: [quality] }), '*')
    }
    send()
    setTimeout(send, 1000)
    setTimeout(send, 3000)
  }

  // Fuente alternativa
  useEffect(() => {
    if (mode !== 'alt') return
    let cancelled = false
    setAltStatus('loading')
    setAlt(null)
    fetch(`/api/video-source?id=${encodeURIComponent(videoId)}`)
      .then((r) => (r.ok ? r.json() : { candidates: [] }))
      .then((d: { candidates?: VideoCandidate[] }) => {
        if (cancelled) return
        if (d.candidates?.length) {
          // La fuente alternativa más cercana a la calidad elegida (sin pasarse)
          const want = QUALITY_HEIGHT[quality] ?? 9999
          const sorted = [...d.candidates].sort((a, b) => b.quality - a.quality)
          const idx = Math.max(0, sorted.findIndex((c) => c.quality <= want))
          setAlt({ candidates: sorted, index: idx })
          setAltStatus('ready')
        } else setAltStatus('error')
      })
      .catch(() => !cancelled && setAltStatus('error'))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, videoId])

  const handleAltError = () => {
    if (alt && alt.index + 1 < alt.candidates.length) setAlt({ ...alt, index: alt.index + 1 })
    else setAltStatus('error')
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const iconBtn = 'p-2 rounded-lg transition-all duration-200'

  // Reproductor propio (los controles de YouTube van ocultos): tiempo, play/pausa, saltos
  const sendYt = (func: string, args: unknown[] = []) =>
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*')
  // Los que siguen en la lista (para echar un vistazo bajo el video)
  const upcoming = useMemo(() => {
    if (!list?.length || !onPick) return []
    const i = list.findIndex((v) => v.id === videoId)
    const rest = i >= 0 ? [...list.slice(i + 1), ...list.slice(0, i)] : list.filter((v) => v.id !== videoId)
    return rest.slice(0, 20)
  }, [list, onPick, videoId])
  // Canción: si se ve en la TV, la TV pasa a la canción en el mismo segundo (el teléfono sigue callado)
  const toSong = () => {
    if (castHereRef.current) {
      tvTake(false, tvSync.pos, true)
      ;(onSong ?? onClose)(tvSync.pos)
      return
    }
    ;(onSong ?? onClose)(timeRef.current)
  }
  // Me gusta y Ver después: si la sección no los maneja, se guardan en la Biblioteca (Videos)
  const storeLiked = useVideoStore((st) => st.liked.some((v) => v.id === videoId))
  const storeLater = useVideoStore((st) => st.watchLater.some((v) => v.id === videoId))
  const savedVideo = { id: videoId, title, channelTitle, thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` }
  const isLikedNow = onToggleLike ? !!liked : storeLiked
  const isLaterNow = onToggleLater ? !!later : storeLater
  const likeNow = () => (onToggleLike ? onToggleLike() : useVideoStore.getState().toggle('liked', savedVideo))
  const laterNow = () => (onToggleLater ? onToggleLater() : useVideoStore.getState().toggle('watchLater', savedVideo))
  const isPlaying = castHere ? tvPlaying : mode === 'youtube' ? ytPlaying : altPlaying
  const togglePlay = () => {
    if (castHereRef.current) {
      nativeCastControl(tvPlaying ? 'pause' : 'play')
      setTvPlaying(!tvPlaying)
      return
    }
    if (mode === 'youtube') {
      sendYt(ytPlaying ? 'pauseVideo' : 'playVideo')
      setYtPlaying(!ytPlaying)
    } else {
      const v = altVideoRef.current
      if (!v) return
      if (v.paused) v.play().catch(() => {})
      else v.pause()
    }
  }
  const seek = (t: number) => {
    timeRef.current = t
    setPos(t)
    if (castHereRef.current) {
      tvSync.pos = t
      nativeCastControl(`seek:${t}`)
      return
    }
    if (mode === 'youtube') sendYt('seekTo', [t, true])
    else if (altVideoRef.current) altVideoRef.current.currentTime = t
  }
  const fullscreen = () => {
    const el = boxRef.current
    if (!el) return
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else el.requestFullscreen?.().catch(() => {})
  }

  // Ventana flotante: el video sale del navegador y queda sobre el escritorio (Chrome o Edge para
  // videos de YouTube; cualquier navegador para el video alternativo en MP4). La ventana vive aparte
  // del reproductor: cerrar este video no la cierra.
  const [floating, setFloating] = useState(false)
  const [canFloat, setCanFloat] = useState(false)
  useEffect(() => {
    setCanFloat(true)
    setFloating(floatingId() === videoId)
  }, [videoId])
  const floatVideo = async () => {
    try {
      // En el teléfono: miniatura que se mueve por la pantalla (el sonido pasa al reproductor de abajo)
      if (mode !== 'alt' && isPhoneScreen()) {
        openMini({ id: videoId, title, channel: channelTitle }, timeRef.current || 0)
        onClose(timeRef.current || undefined)
        return
      }
      if (mode === 'alt' && altVideoRef.current) {
        await altVideoRef.current.requestPictureInPicture()
        return
      }
      const ok = openFloat({
        videoId,
        start: timeRef.current || 0,
        onClosed: (sec) => {
          // Volvió: el video sigue en la página, en el mismo segundo (si la página sigue aquí)
          timeRef.current = sec
          setFloating(false)
          const w = iframeRef.current?.contentWindow
          w?.postMessage(JSON.stringify({ event: 'command', func: 'seekTo', args: [sec, true] }), '*')
          w?.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*')
        },
      })
      if (!ok) return
      iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), '*')
      setFloating(true)
    } catch {
      setFloating(false)
    }
  }
  const backHere = () => closeFloat()

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose(timeRef.current)
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 bg-obsidian border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-7 h-7 bg-violet-600 rounded-lg flex items-center justify-center shrink-0">
            <TvMinimalPlay className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-white font-semibold text-sm leading-tight truncate max-w-[45vw] sm:max-w-[60vw]">{title}</p>
            <p className="text-slate-400 text-xs truncate">{channelTitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-2">
          {onNext && onToggleAutoplay && (
            <button
              onClick={onToggleAutoplay}
              aria-pressed={autoNext}
              className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-semibold ${autoNext ? 'bg-violet-500/25 text-violet-200' : 'bg-white/5 text-slate-400'}`}
              title="Reproducción automática: al terminar sigue el próximo"
            >
              Auto {autoNext ? 'sí' : 'no'}
            </button>
          )}
          <button
            onClick={() => (canFloat && !floating && !castHere ? floatVideo() : onClose(timeRef.current))}
            className={`${iconBtn} text-slate-400 hover:text-white hover:bg-white/10`}
            title="Minimizar: el video sigue en una ventana pequeña"
            aria-label="Minimizar"
          >
            <ChevronDown className="w-5 h-5" />
          </button>
          <button onClick={() => onClose(timeRef.current)} className={`${iconBtn} text-slate-400 hover:text-white hover:bg-white/10`} title="Cerrar (Esc)" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-start p-2 sm:p-4 min-h-0 gap-3 overflow-y-auto">
        {/* El video queda fijo arriba mientras se recorre la lista de abajo */}
        <div className="w-full max-w-6xl sticky top-0 z-20 bg-black -mt-2 pt-2 sm:-mt-4 sm:pt-4 border-b border-white/5">
          {songToggle && (
            <div className="mb-3 mx-auto w-fit flex p-1 rounded-full bg-surface-2/80 border border-white/10" role="tablist" aria-label="Canción o video">
              <button role="tab" aria-selected={false} onClick={toSong} className="flex items-center gap-1.5 px-5 py-1.5 rounded-full text-slate-200 text-sm font-bold">
                <Headphones className="w-4 h-4" /> Canción
              </button>
              <button role="tab" aria-selected className="flex items-center gap-1.5 px-5 py-1.5 rounded-full bg-white text-black text-sm font-bold">
                <MonitorPlay className="w-4 h-4" /> Video
              </button>
            </div>
          )}
          <div
            ref={boxRef}
            className="relative w-full aspect-video rounded-xl overflow-hidden shadow-2xl shadow-black bg-black"
            data-cpn-video={mode === 'youtube' && ytPlaying ? 'playing' : ''}
          >
            {castHere && (
              <div className="absolute inset-0 z-30 bg-black/90 flex flex-col items-center justify-center gap-2 p-4 text-center">
                <Cast className="w-8 h-8 text-violet-300" />
                <p className="text-white text-sm font-semibold">Se está viendo en {tvDevice}</p>
                <p className="text-slate-400 text-xs">Usa los controles de abajo para manejar la TV</p>
              </div>
            )}
            {floating && (
              <div className="absolute inset-0 z-30 bg-black/85 flex flex-col items-center justify-center gap-3 p-4 text-center">
                <PictureInPicture2 className="w-8 h-8 text-violet-300" />
                <p className="text-white text-sm font-semibold">El video sigue en la ventana flotante</p>
                <button onClick={backHere} className="px-5 py-2.5 rounded-full bg-violet-500 text-white text-sm font-bold">Traer de vuelta aquí</button>
              </div>
            )}
            {ended && onNext && (
              <div className="absolute inset-0 z-20 bg-black/80 flex flex-col items-center justify-center gap-3 p-4 text-center">
                <p className="text-slate-300 text-sm">Terminó{upNext ? <>. Sigue: <b className="text-white">{upNext}</b></> : ''}</p>
                <button onClick={() => (setEnded(false), onNext())} className="px-5 py-2.5 rounded-full bg-violet-500 text-white text-sm font-bold">
                  Ver siguiente
                </button>
              </div>
            )}
            {mode === 'youtube' ? (
              <iframe
                ref={iframeRef}
                key={`${videoId}-${quality}`}
                src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=${castOnOpenRef.current ? 0 : 1}&rel=0&modestbranding=1&color=white&hl=es&cc_lang_pref=es&playsinline=1&controls=0&fs=0&iv_load_policy=3&enablejsapi=1${
                  quality !== 'auto' ? `&vq=${quality}` : ''
                }${startAt ? `&start=${startAt}` : ''}${startMuted ? '&mute=1' : ''}&origin=${encodeURIComponent(origin)}`}
                title={title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                onLoad={handleIframeLoad}
                className="absolute inset-0 w-full h-full"
              />
            ) : altStatus === 'ready' && alt ? (
              <video
                ref={altVideoRef}
                key={alt.candidates[alt.index].url}
                onEnded={() => onEndRef.current()}
                onPlaying={() => finishSwapBackRef.current()}
                onLoadedMetadata={(e) => {
                  if (timeRef.current > 1) e.currentTarget.currentTime = timeRef.current
                }}
                onTimeUpdate={(e) => {
                  timeRef.current = e.currentTarget.currentTime
                  setPos(e.currentTarget.currentTime)
                  if (!e.currentTarget.paused) lastPlayingAtRef.current = Date.now()
                }}
                onDurationChange={(e) => setLen(e.currentTarget.duration || 0)}
                onPlay={() => setAltPlaying(true)}
                onPause={() => setAltPlaying(false)}
                onClick={togglePlay}
                src={alt.candidates[alt.index].url}
                autoPlay
                playsInline
                onError={handleAltError}
                className="absolute inset-0 w-full h-full bg-black"
              />
            ) : altStatus === 'loading' ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-300">
                <Loader2 className="w-10 h-10 text-violet-300 animate-spin" />
                <p className="text-sm">{autoSwitched ? 'YouTube no permite verlo aquí. Buscando otra fuente…' : 'Buscando otra fuente…'}</p>
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6">
                <AlertCircle className="w-9 h-9 text-red-400" />
                <p className="text-white font-semibold">Este video no está disponible en ninguna fuente</p>
                <p className="text-slate-400 text-sm">Puede estar eliminado o bloqueado en tu país.</p>
                <a
                  href={`https://www.youtube.com/watch?v=${videoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-2 bg-surface-2 border border-white/10 text-slate-200 text-sm font-semibold px-4 py-2 rounded-full"
                >
                  <ExternalLink className="w-4 h-4" /> Abrir en YouTube
                </a>
              </div>
            )}
          </div>

        {/* Reproductor: tiempo, controles y opciones ordenadas (fijos junto al video) */}
        <div className="w-full px-1 pt-2 pb-2">
          <input
            type="range"
            min={0}
            max={len || 0}
            step={0.5}
            value={Math.min(pos, len || 0)}
            onChange={(e) => seek(Number(e.target.value))}
            disabled={!len}
            aria-label="Avance del video"
            className="w-full h-1.5 accent-violet-400 cursor-pointer"
          />
          <div className="flex items-center justify-between text-[11px] text-slate-400 tabular-nums -mt-0.5">
            <span>{fmt(pos)}</span>
            <span>{len ? fmt(len) : '--:--'}</span>
          </div>
          <div className="mt-2 flex items-center justify-center gap-3 sm:gap-6">
            <button onClick={() => setCastOpen(true)} className={`w-11 h-11 rounded-full flex items-center justify-center hover:bg-white/10 ${castHere ? 'text-violet-300' : 'text-slate-200'}`} aria-label="Ver en la TV" title="Ver en la TV">
              <Cast className="w-6 h-6" />
            </button>
            <button onClick={() => seek(Math.max(0, pos - 10))} className="w-11 h-11 rounded-full flex items-center justify-center text-slate-200 hover:bg-white/10" aria-label="Atrás 10 segundos">
              <RotateCcw className="w-6 h-6" />
            </button>
            <button onClick={togglePlay} className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center shadow-lg active:scale-95 transition-transform" aria-label={isPlaying ? 'Pausar' : 'Reproducir'}>
              {isPlaying ? <Pause className="w-7 h-7 fill-black" /> : <Play className="w-7 h-7 fill-black ml-1" />}
            </button>
            <button onClick={() => seek(len ? Math.min(len - 1, pos + 10) : pos + 10)} className="w-11 h-11 rounded-full flex items-center justify-center text-slate-200 hover:bg-white/10" aria-label="Adelantar 10 segundos">
              <RotateCw className="w-6 h-6" />
            </button>
            <button onClick={() => onNext?.()} disabled={!onNext} className="w-11 h-11 rounded-full flex items-center justify-center text-slate-200 hover:bg-white/10 disabled:opacity-30" aria-label="Siguiente video" title={upNext ? `Siguiente: ${upNext}` : 'Siguiente'}>
              <SkipForward className="w-6 h-6" />
            </button>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pb-1 sm:justify-center">
            {(
              <Opt onClick={likeNow} active={isLikedNow} label="Me gusta" icon={<Heart className={`w-5 h-5 ${isLikedNow ? 'fill-violet-300 text-violet-300' : ''}`} />} />
            )}
            {<Opt onClick={laterNow} active={isLaterNow} label={isLaterNow ? 'Guardado' : 'Ver después'} icon={<Clock3 className="w-5 h-5" />} />}
            <div className="shrink-0 w-[4.5rem] flex flex-col items-center gap-1">
              <VideoAudioDownload compact id={videoId} title={title} channelTitle={channelTitle} className="!w-12 !h-12 !rounded-2xl !bg-surface-2/80 !border !border-white/10 !backdrop-blur-0" />
              <span className="text-[11px] text-slate-300 leading-tight text-center">Descargar</span>
            </div>
            {canFloat && <Opt onClick={floating ? backHere : floatVideo} active={floating} label={floating ? 'Traer aquí' : 'Flotante'} icon={<PictureInPicture2 className="w-5 h-5" />} />}
            <Opt onClick={fullscreen} label="Pantalla completa" icon={<Maximize className="w-5 h-5" />} />
            <Opt onClick={() => setQualityOpen(true)} label={QUALITIES.find((q) => q.id === quality)?.label.split(' ')[0] ?? 'Calidad'} icon={<Settings2 className="w-5 h-5" />} />
            <Opt onClick={() => setSocialOpen(true)} label="Comentarios" icon={<MessageCircle className="w-5 h-5" />} />
            {mode === 'youtube' ? (
              <Opt onClick={() => switchToAlt(false)} active={ytSlow && !ytReady} label="Otra fuente" icon={<RefreshCw className="w-5 h-5" />} />
            ) : (
              <>
                {altStatus === 'ready' && alt && alt.candidates.length > 1 && (
                  <Opt onClick={handleAltError} label={`Fuente ${alt.index + 1}/${alt.candidates.length}`} icon={<RefreshCw className="w-5 h-5" />} />
                )}
                <Opt onClick={() => setMode('youtube')} label="YouTube" icon={<TvMinimalPlay className="w-5 h-5" />} />
              </>
            )}
            <Opt href={`https://www.youtube.com/watch?v=${videoId}`} label="Abrir YouTube" icon={<ExternalLink className="w-5 h-5" />} />
          </div>
        </div>
        </div>
        {upcoming.length > 0 && (
          <div className="w-full max-w-6xl px-1 pb-6">
            <p className="text-white font-bold text-sm mb-2">A continuación</p>
            <div className="flex flex-col gap-1">
              {upcoming.map((v) => (
                <button key={v.id} onClick={() => onPick?.(v)} className="flex items-center gap-3 text-left rounded-xl p-1.5 hover:bg-white/5 active:bg-white/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`} alt="" loading="lazy" className="w-32 aspect-video rounded-lg object-cover shrink-0 bg-surface-2" />
                  <span className="min-w-0">
                    <span className="block text-white text-sm font-semibold leading-snug line-clamp-2">{v.title}</span>
                    {v.channel && <span className="block text-slate-500 text-xs truncate mt-0.5">{v.channel}</span>}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

      </div>
      {qualityOpen && (
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/60" onClick={() => setQualityOpen(false)}>
          <div className="w-full sm:max-w-xs bg-surface-1 border border-white/10 rounded-t-3xl sm:rounded-3xl p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()} role="menu" aria-label="Calidad">
            <p className="text-white font-bold text-sm px-3 py-2">Calidad</p>
            {QUALITIES.map((q) => (
              <button
                key={q.id}
                role="menuitemradio"
                aria-checked={q.id === quality}
                onClick={() => chooseQuality(q.id)}
                className={`w-full text-left px-4 py-3 rounded-xl text-sm ${q.id === quality ? 'bg-violet-500/20 text-violet-200 font-semibold' : 'text-slate-200 hover:bg-white/5'}`}
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {socialOpen && (
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/60" onClick={() => setSocialOpen(false)}>
          <div
            className="w-full sm:max-w-lg max-h-[80vh] overflow-y-auto overscroll-contain bg-surface-1 border border-white/10 rounded-t-3xl sm:rounded-3xl p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Me gusta y comentarios"
          >
            <div className="flex items-center justify-between px-2 pb-2">
              <p className="text-white font-bold text-sm truncate">{title}</p>
              <button onClick={() => setSocialOpen(false)} className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400" aria-label="Cerrar">
                <X className="w-5 h-5" />
              </button>
            </div>
            <SocialPanel item={videoId} ytId={videoId} className="border-0 bg-transparent p-2" />
          </div>
        </div>
      )}
      {castOpen && (
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/60" onClick={() => setCastOpen(false)}>
          <div
            className="w-full sm:max-w-md bg-surface-1 border border-white/10 rounded-t-3xl sm:rounded-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Ver en la TV"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-bold font-display text-lg">Ver en la TV</h3>
              <button onClick={() => setCastOpen(false)} className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400" aria-label="Cerrar">
                <X className="w-5 h-5" />
              </button>
            </div>
            {tvStatus === 'playing' ? (
              <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-emerald-300 text-sm font-semibold truncate">Reproduciendo en {tvName}</p>
                  <p className="text-slate-400 text-xs">Usa el control de la TV para pausar o adelantar</p>
                </div>
                <button onClick={stopTv} className="shrink-0 text-xs font-bold text-white bg-white/10 rounded-full px-3 py-1.5">
                  Detener
                </button>
              </div>
            ) : (
              <button
                onClick={castToTv}
                disabled={tvStatus === 'connecting'}
                className="w-full flex items-center gap-3 text-left rounded-2xl bg-violet-500/10 border border-violet-500/30 hover:bg-violet-500/20 px-4 py-3 mb-2 disabled:opacity-70"
              >
                <span className="shrink-0 w-10 h-10 rounded-full bg-violet-500 text-white flex items-center justify-center">
                  {tvStatus === 'connecting' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Cast className="w-5 h-5" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-white font-semibold text-sm">
                    {tvStatus === 'connecting' ? 'Conectando con la TV…' : 'Transmitir a Chromecast / Google TV'}
                  </span>
                  <span className="block text-slate-400 text-xs">{nativeCastAvailable() ? 'Elige tu TV aquí mismo: pone este video desde el mismo segundo.' : 'La TV abre YouTube y pone este video desde el mismo segundo.'}</span>
                </span>
              </button>
            )}
            {tvStatus === 'unsupported' && (
              <p className="text-amber-300 text-sm mb-2">Para transmitir abre esta app con Google Chrome (en Android o computador).</p>
            )}
            {tvStatus === 'error' && <p className="text-amber-300 text-sm mb-2">{tvError}</p>}
            {mode === 'alt' && altStatus === 'ready' && alt && (
              <div className="flex items-center gap-3 rounded-2xl bg-violet-500/10 border border-violet-500/30 px-4 py-3 mb-2">
                <CastButton videoRef={altVideoRef} media={{ url: alt.candidates[alt.index].url, title, poster: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` }} />
                <span className="text-slate-300 text-sm">Enviar esta fuente con Chromecast o AirPlay</span>
              </div>
            )}
            {canOpenMirroring() ? (
              <button
                onClick={() => (openMirroring(), setCastOpen(false))}
                className="w-full flex items-center gap-3 text-left rounded-2xl bg-surface-2/60 border border-white/8 px-4 py-3"
              >
                <span className="shrink-0 w-10 h-10 rounded-full bg-surface-1 text-violet-300 flex items-center justify-center">
                  <MonitorSmartphone className="w-5 h-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-white font-semibold text-sm">Otra TV (Smart View, Miracast…)</span>
                  <span className="block text-slate-400 text-xs">Abre directo «Transmitir / Duplicar pantalla» del teléfono para elegir la TV.</span>
                </span>
              </button>
            ) : (
            <div className="rounded-2xl bg-surface-2/60 border border-white/8 p-4">
              <p className="flex items-center gap-2 text-white font-semibold text-sm mb-2">
                <MonitorSmartphone className="w-5 h-5 text-violet-300" /> Duplicar pantalla
              </p>
              <ul className="text-slate-400 text-sm space-y-1.5 list-disc pl-5">
                <li>
                  <b className="text-slate-200">Android:</b> baja la barra de notificaciones y toca <i>Smart View</i>, <i>Transmitir</i> o{' '}
                  <i>Duplicar pantalla</i>.
                </li>
                <li>
                  <b className="text-slate-200">iPhone:</b> Centro de control → <i>Duplicar pantalla</i>.
                </li>
                <li>Luego pon el video en pantalla completa.</li>
              </ul>
            </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function fmt(t: number) {
  if (!isFinite(t) || t < 0) t = 0
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const sec = Math.floor(t % 60)
  return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(sec).padStart(2, '0')}`
}

/** Botón de opción del reproductor: ícono en un cuadro y su nombre debajo (todos del mismo tamaño) */
function Opt({ icon, label, onClick, href, active = false }: { icon: React.ReactNode; label: string; onClick?: () => void; href?: string; active?: boolean }) {
  const box = `w-12 h-12 rounded-2xl flex items-center justify-center border transition-colors ${active ? 'bg-violet-500/25 border-violet-400/40 text-violet-200' : 'bg-surface-2/80 border-white/10 text-slate-200 group-hover:text-white'}`
  const inner = (
    <>
      <span className={box}>{icon}</span>
      <span className="text-[11px] text-slate-300 leading-tight text-center line-clamp-2">{label}</span>
    </>
  )
  const cls = 'group shrink-0 w-[4.5rem] flex flex-col items-center gap-1'
  if (href)
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {inner}
      </a>
    )
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={cls}>
      {inner}
    </button>
  )
}
