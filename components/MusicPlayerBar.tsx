'use client'

import dynamic from 'next/dynamic'
import { useRef, useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  ListMusic,
  X,
  ChevronDown,
  Music,
  PictureInPicture2,
  Plus,
  Heart,
  Sparkles,
  Maximize,
  Maximize2,
  Minimize2,
  Headphones,
  Loader2,
  Radio,
} from 'lucide-react'
import { useMusicStore, parseTrackMeta } from '@/store/musicStore'
import { findAudioCandidates, type AudioCandidate } from '@/lib/audio-sources'
import type { MusicVideo } from '@/lib/youtube-music'
// react-player v3 — ref is HTMLVideoElement, props use native HTML video API
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ReactPlayer = dynamic(() => import('react-player'), { ssr: false }) as any

// Candidatos de audio por video (compartido entre renders; las URLs duran horas)
const audioCache = new Map<string, Promise<AudioCandidate[]>>()

function loadAudioCandidates(id: string): Promise<AudioCandidate[]> {
  let p = audioCache.get(id)
  if (!p) {
    p = fetch(`/api/audio?id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : { candidates: [] }))
      .then((d: { candidates?: AudioCandidate[] }) => d.candidates ?? [])
      .catch(() => [] as AudioCandidate[])
      // Si el servidor no consigue fuentes (p. ej. bloqueado), lo intenta el propio navegador
      .then((c) => (c.length > 0 ? c : findAudioCandidates(id).catch(() => [])))
      .then((c) => {
        if (c.length === 0) audioCache.delete(id)
        return c
      })
    audioCache.set(id, p)
  }
  return p
}

// Tiempo tras pasar a segundo plano en el que una pausa se considera automática (de YouTube)
const AUTO_RESUME_WINDOW_MS = 5000

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0 || seconds === 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function MusicPlayerBar() {
  const playerRef = useRef<HTMLVideoElement>(null)
  const [isSeeking, setIsSeeking] = useState(false)
  const [localPlayed, setLocalPlayed] = useState(0)
  const [localDuration, setLocalDuration] = useState(0)
  const [showVolumeSlider, setShowVolumeSlider] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [barHeight, setBarHeight] = useState(0)
  const barRef = useRef<HTMLDivElement>(null)
  const videoWrapRef = useRef<HTMLDivElement>(null)

  const {
    queue,
    currentIndex,
    isPlaying,
    volume,
    isMuted,
    played,
    isVisible,
    isQueueOpen,
    saved,
    audioBoost,
    hasHydrated,
    playNext,
    playPrev,
    togglePlay,
    setIsPlaying,
    setVolume,
    toggleMute,
    setPlayed,
    setDuration,
    registerSeek,
    toggleQueue,
    dismiss,
    playIndex,
    removeFromQueue,
    toggleSaved,
    setAudioBoost,
    audioMode,
    setAudioMode,
    radioEnabled,
    setRadioEnabled,
    appendToQueue,
    consumeResume,
  } = useMusicStore()

  const currentVideo = queue[currentIndex]

  // ===== Radio: al empezar la última canción de la cola, se añade música parecida =====
  const [isRadioLoading, setIsRadioLoading] = useState(false)
  const isRadioLoadingRef = useRef(false)
  isRadioLoadingRef.current = isRadioLoading
  const radioSeedRef = useRef<string | null>(null)
  // La canción terminó mientras la radio aún buscaba: seguir en cuanto lleguen canciones
  const waitingForRadioRef = useRef(false)
  const isLastTrack = queue.length > 0 && currentIndex === queue.length - 1

  useEffect(() => {
    if (!radioEnabled || !isLastTrack || !currentVideo || radioSeedRef.current === currentVideo.id) return
    radioSeedRef.current = currentVideo.id
    const { history } = useMusicStore.getState()

    // Semilla: artista de la canción actual + tu artista más escuchado
    const artists: string[] = []
    const currentArtist = parseTrackMeta(currentVideo).artist || currentVideo.channelTitle
    if (currentArtist) artists.push(currentArtist)
    for (const h of history) {
      const a = h.artist || h.channelTitle
      if (a && !artists.includes(a)) {
        artists.push(a)
        break
      }
    }
    const ids = Array.from(
      new Set([currentVideo.id, ...queue.slice(-10).map((v) => v.id), ...history.slice(0, 14).map((h) => h.id)])
    ).slice(0, 25)

    const params = new URLSearchParams({ ids: ids.join(','), genres: '1' })
    artists.forEach((a) => params.append('artist', a))
    setIsRadioLoading(true)
    fetch(`/api/youtube/for-you?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { videos?: MusicVideo[] } | null) => {
        const list = data?.videos ?? []
        // Preferimos lo que no has escuchado nunca; si queda poco, se completa con lo demás
        const heard = new Set(useMusicStore.getState().history.map((h) => h.id))
        const fresh = list.filter((v) => !heard.has(v.id))
        const added = appendToQueue((fresh.length >= 5 ? fresh : list).slice(0, 15))
        if (added > 0 && waitingForRadioRef.current) useMusicStore.getState().playNext()
      })
      .catch(() => {
        radioSeedRef.current = null
      })
      .finally(() => {
        waitingForRadioRef.current = false
        setIsRadioLoading(false)
      })
  }, [radioEnabled, isLastTrack, currentVideo, queue, appendToQueue])

  // ===== Modo audio (segundo plano real) =====
  const [audioSrc, setAudioSrc] = useState<{ id: string; candidates: AudioCandidate[]; index: number } | null>(null)
  const [audioFailedIds, setAudioFailedIds] = useState<Set<string>>(() => new Set())
  const pendingSeekRef = useRef(-1)
  const currentId = currentVideo?.id
  const useAudio = audioMode && !!currentId && !audioFailedIds.has(currentId)
  const useAudioRef = useRef(useAudio)
  useAudioRef.current = useAudio
  const audioUrl =
    useAudio && audioSrc?.id === currentId ? audioSrc.candidates[audioSrc.index]?.url : undefined
  const isAudioLoading = useAudio && !audioUrl

  const markAudioFailed = useCallback((id: string) => {
    setAudioFailedIds((prev) => new Set(prev).add(id))
  }, [])

  useEffect(() => {
    if (!useAudio || !currentId) return
    if (audioSrc?.id === currentId) return
    let cancelled = false
    loadAudioCandidates(currentId).then((candidates) => {
      if (cancelled) return
      if (candidates.length === 0) markAudioFailed(currentId)
      else setAudioSrc({ id: currentId, candidates, index: 0 })
    })
    return () => {
      cancelled = true
    }
  }, [useAudio, currentId, audioSrc?.id, markAudioFailed])

  // Pre-carga la siguiente canción para que el cambio sea inmediato con la pantalla bloqueada
  const nextId = queue[currentIndex + 1]?.id
  useEffect(() => {
    if (audioMode && nextId) loadAudioCandidates(nextId)
  }, [audioMode, nextId])

  const handleAudioError = useCallback(() => {
    if (!audioSrc || audioSrc.id !== currentId) return
    if (audioSrc.index + 1 < audioSrc.candidates.length) {
      pendingSeekRef.current = useMusicStore.getState().played
      setAudioSrc({ ...audioSrc, index: audioSrc.index + 1 })
    } else {
      audioCache.delete(audioSrc.id)
      pendingSeekRef.current = useMusicStore.getState().played
      markAudioFailed(audioSrc.id)
    }
  }, [audioSrc, currentId, markAudioFailed])

  const switchMode = useCallback(
    (toAudio: boolean) => {
      pendingSeekRef.current = useMusicStore.getState().played
      setAudioMode(toAudio)
      if (toAudio) {
        setIsExpanded(false)
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
      }
    },
    [setAudioMode]
  )
  const isCurrentSaved = currentVideo ? saved.some((t) => t.id === currentVideo.id) : false
  const hasResumedRef = useRef(false)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const gainRef = useRef<GainNode | null>(null)
  const compressorRef = useRef<DynamicsCompressorNode | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)

  const attachAudioGraph = useCallback(() => {
    const el = playerRef.current
    if (!el) return false
    try {
      if (!audioCtxRef.current) {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        if (!Ctx) return false
        const ctx = new Ctx()
        const source = ctx.createMediaElementSource(el)
        const compressor = ctx.createDynamicsCompressor()
        compressor.threshold.value = -24
        compressor.knee.value = 30
        compressor.ratio.value = 3
        compressor.attack.value = 0.003
        compressor.release.value = 0.25
        const gain = ctx.createGain()
        gain.gain.value = 1
        source.connect(compressor)
        compressor.connect(gain)
        gain.connect(ctx.destination)
        audioCtxRef.current = ctx
        compressorRef.current = compressor
        gainRef.current = gain
        sourceRef.current = source
      }
      if (audioCtxRef.current?.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {})
      }
      return true
    } catch {
      // CORS or already-connected element: fall back silently.
      return false
    }
  }, [])

  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = audioBoost ? 1.35 : 1
  }, [audioBoost])

  useEffect(() => {
    const el = playerRef.current
    if (!useAudio || !el || !audioUrl) return
    if (isPlaying && el.paused) {
      el.play().catch((err: DOMException) => {
        if (err?.name === 'NotAllowedError') setIsPlaying(false)
      })
    } else if (!isPlaying && !el.paused) {
      el.pause()
    }
  }, [useAudio, audioUrl, isPlaying, setIsPlaying])

  useEffect(() => {
    const el = playerRef.current
    if (useAudio && el) el.volume = isMuted ? 0 : volume
  }, [useAudio, audioUrl, volume, isMuted])

  // Register seekTo using the native HTMLVideoElement API
  useEffect(() => {
    registerSeek((fraction: number) => {
      const el = playerRef.current
      if (el && isFinite(el.duration) && el.duration > 0) {
        el.currentTime = fraction * el.duration
      }
    })
  }, [registerSeek])

  // Sync localPlayed from store when not manually seeking
  useEffect(() => {
    if (!isSeeking) setLocalPlayed(played)
  }, [played, isSeeking])

  // react-player v3: onTimeUpdate receives a React.SyntheticEvent<HTMLMediaElement>
  const handleTimeUpdate = useCallback(
    (e: React.SyntheticEvent<HTMLMediaElement>) => {
      const el = e.currentTarget
      if (!isSeeking && isFinite(el.duration) && el.duration > 0) {
        const fraction = el.currentTime / el.duration
        setPlayed(fraction)
        setLocalPlayed(fraction)
      }
    },
    [isSeeking, setPlayed]
  )

  const handleDurationChange = useCallback(
    (e: React.SyntheticEvent<HTMLMediaElement>) => {
      const d = e.currentTarget.duration
      if (isFinite(d) && d > 0) {
        setDuration(d)
        setLocalDuration(d)
      }
    },
    [setDuration]
  )

  // ===== Reproducción en segundo plano =====
  // YouTube pausa el video cuando la app pasa a segundo plano o se bloquea la pantalla.
  // Si esa pausa llega justo después de ocultarse la página (y no la pidió el usuario),
  // volvemos a darle play. Una pausa posterior (p. ej. desde la pantalla de bloqueo) se respeta.
  const isPlayingRef = useRef(isPlaying)
  isPlayingRef.current = isPlaying
  const hiddenAtRef = useRef(0)
  const keepPlayingRef = useRef(false)

  const resumeIfNeeded = useCallback(() => {
    const el = playerRef.current
    if (!el || !keepPlayingRef.current || useAudioRef.current) return
    if (el.paused) el.play()?.catch?.(() => {})
  }, [])

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now()
        keepPlayingRef.current = isPlayingRef.current
        if (keepPlayingRef.current) {
          for (const ms of [250, 800, 1600, 3000]) timers.push(setTimeout(resumeIfNeeded, ms))
        }
      } else {
        timers.splice(0).forEach(clearTimeout)
        hiddenAtRef.current = 0
        if (keepPlayingRef.current) {
          resumeIfNeeded()
          setIsPlaying(true)
        }
        keepPlayingRef.current = false
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      timers.forEach(clearTimeout)
    }
  }, [resumeIfNeeded, setIsPlaying])

  const handleEnded = useCallback(() => {
    const { queue: q, currentIndex: i } = useMusicStore.getState()
    if (i >= q.length - 1 && isRadioLoadingRef.current) waitingForRadioRef.current = true
    playNext()
  }, [playNext])
  const handlePlay = useCallback(() => {
    setIsPlaying(true)
    // El audio de otro dominio sin CORS se silenciaría al pasar por Web Audio
    if (!useAudioRef.current) attachAudioGraph()
  }, [setIsPlaying, attachAudioGraph])
  const handlePause = useCallback((e?: React.SyntheticEvent<HTMLMediaElement>) => {
    // Al terminar una canción también llega "pause": lo gestiona onEnded
    if (e?.currentTarget?.ended) return
    if (useAudioRef.current) {
      // Con <audio> propio no hay pausas automáticas: cualquier pausa es del usuario
      keepPlayingRef.current = false
      setIsPlaying(false)
      return
    }
    const hiddenFor = hiddenAtRef.current ? Date.now() - hiddenAtRef.current : -1
    if (document.visibilityState === 'hidden' && keepPlayingRef.current && hiddenFor >= 0 && hiddenFor < AUTO_RESUME_WINDOW_MS) {
      // Pausa automática de YouTube al ir a segundo plano: reanudar.
      setTimeout(resumeIfNeeded, 50)
      return
    }
    // Pausa real del usuario (también desde la pantalla de bloqueo)
    keepPlayingRef.current = false
    setIsPlaying(false)
  }, [setIsPlaying, resumeIfNeeded])

  const handleLoadedMetadata = useCallback(
    (e: React.SyntheticEvent<HTMLMediaElement>) => {
      const el = e.currentTarget
      // Cambio de modo audio/video o de fuente: seguir donde iba
      if (pendingSeekRef.current >= 0) {
        const f = pendingSeekRef.current
        pendingSeekRef.current = -1
        if (f > 0 && isFinite(el.duration) && el.duration > 0) el.currentTime = f * el.duration
        hasResumedRef.current = true
        return
      }
      if (hasResumedRef.current) return
      const resume = consumeResume()
      if (resume > 0 && isFinite(el.duration) && el.duration > 0) {
        el.currentTime = resume * el.duration
        setPlayed(resume)
        setLocalPlayed(resume)
      }
      hasResumedRef.current = true
    },
    [consumeResume, setPlayed]
  )

  useEffect(() => {
    // Reset resume flag whenever the active track changes so future songs
    // don't inherit the previous song's seek position.
    hasResumedRef.current = false
  }, [currentVideo?.id])

  // Pointer events cubren ratón y pantallas táctiles
  const handleSeekStart = () => setIsSeeking(true)

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setLocalPlayed(parseFloat(e.target.value))

  const handleSeekEnd = (e: React.SyntheticEvent<HTMLInputElement>) => {
    setIsSeeking(false)
    const fraction = parseFloat(e.currentTarget.value)
    const el = playerRef.current
    if (el && isFinite(el.duration) && el.duration > 0) {
      el.currentTime = fraction * el.duration
    }
    setPlayed(fraction)
    setLocalPlayed(fraction)
  }

  const handlePiP = useCallback(async () => {
    try {
      const el = playerRef.current
      if (!el) return
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
      } else {
        await el.requestPictureInPicture()
      }
    } catch {
      // PiP not available
    }
  }, [])

  const handleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
        return
      }
      const wrap = videoWrapRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null
      if (wrap?.requestFullscreen) await wrap.requestFullscreen()
      else if (wrap?.webkitRequestFullscreen) wrap.webkitRequestFullscreen()
      else setIsExpanded(true)
    } catch {
      // Pantalla completa no disponible: al menos ampliamos el video
      setIsExpanded(true)
    }
  }, [])

  // Controles en la pantalla de bloqueo / notificación para usar la app en segundo plano
  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentVideo) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentVideo.title,
      artist: currentVideo.channelTitle,
      album: 'Carlos P. Nauto Interactive',
      artwork: currentVideo.thumbnail
        ? [{ src: currentVideo.thumbnail, sizes: '480x360', type: 'image/jpeg' }]
        : [{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
    })
  }, [currentVideo])

  useEffect(() => {
    if (!('mediaSession' in navigator) || !localDuration) return
    try {
      navigator.mediaSession.setPositionState({
        duration: localDuration,
        position: Math.min(localDuration, localPlayed * localDuration),
        playbackRate: 1,
      })
    } catch {}
  }, [localDuration, localPlayed])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'
  }, [isPlaying])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const ms = navigator.mediaSession
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => setIsPlaying(true)],
      [
        'pause',
        () => {
          keepPlayingRef.current = false
          setIsPlaying(false)
        },
      ],
      ['previoustrack', () => playPrev()],
      ['nexttrack', () => playNext()],
      [
        'seekto',
        (d) => {
          const el = playerRef.current
          if (el && d.seekTime != null) el.currentTime = d.seekTime
        },
      ],
    ]
    for (const [action, handler] of handlers) {
      try {
        ms.setActionHandler(action, handler)
      } catch {
        // Acción no soportada por este navegador
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          ms.setActionHandler(action, null)
        } catch {}
      }
    }
  }, [setIsPlaying, playPrev, playNext])

  const isBarShown = hasHydrated && isVisible && !!currentVideo

  // Mide el alto real de la barra (cambia en móvil, escritorio y modo ampliado)
  useEffect(() => {
    const el = barRef.current
    if (!isBarShown || !el) {
      setBarHeight(0)
      return
    }
    const ro = new ResizeObserver(() => setBarHeight(el.offsetHeight))
    ro.observe(el)
    setBarHeight(el.offsetHeight)
    return () => ro.disconnect()
  }, [isBarShown])

  const youtubeUrl = currentVideo
    ? `https://www.youtube.com/watch?v=${currentVideo.id}`
    : ''

  if (!isBarShown) return null

  const progressPercent = localPlayed * 100
  const isLastInQueue = currentIndex >= queue.length - 1

  const playerProps = {
    ref: playerRef,
    src: youtubeUrl,
    playing: isPlaying,
    volume: isMuted ? 0 : volume,
    onTimeUpdate: handleTimeUpdate,
    onDurationChange: handleDurationChange,
    onLoadedMetadata: handleLoadedMetadata,
    onEnded: handleEnded,
    onPlay: handlePlay,
    onPause: handlePause,
    width: '100%',
    height: '100%',
    config: {
      youtube: {
        rel: 0,
        iv_load_policy: 3,
        playsinline: 1,
        hl: 'es',
        disablekb: 0,
        // Hint YouTube to pick a high-definition stream (audio bitrate improves alongside video quality on YT)
        vq: 'hd720',
        hd: 1,
      },
    },
  }

  const iconBtn = 'p-2 sm:p-1.5 transition-colors'

  return (
    <>
      {/* Reserva el alto del reproductor para que no tape el contenido ni el footer */}
      <div aria-hidden style={{ height: barHeight }} />

      {/* ===== PLAYER BAR ===== */}
      <div ref={barRef} className="fixed bottom-14 sm:bottom-0 left-0 right-0 z-[80] select-none">
        {/* ===== QUEUE PANEL ===== */}
        {isQueueOpen && (
          <div className="absolute bottom-full right-0 sm:right-4 sm:mb-2 w-full sm:w-80 max-h-[50vh] sm:max-h-[340px] bg-[#0d0d0d] backdrop-blur-xl border border-white/10 sm:rounded-xl overflow-hidden shadow-2xl shadow-black/80 flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2">
                <ListMusic className="w-4 h-4 text-purple-400" />
                <span className="text-white font-semibold text-sm">
                  Cola <span className="text-slate-500 font-normal">({queue.length})</span>
                </span>
              </div>
              <button onClick={toggleQueue} className="p-1 text-slate-500 hover:text-white transition-colors" aria-label="Cerrar cola">
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 overscroll-contain">
              {queue.map((video, index) => (
                <div
                  key={`${video.id}-${index}`}
                  onClick={() => playIndex(index)}
                  className={`flex items-center gap-3 px-4 py-2.5 group cursor-pointer transition-colors ${
                    index === currentIndex
                      ? 'bg-purple-500/15 border-l-2 border-purple-500'
                      : 'hover:bg-white/5 border-l-2 border-transparent'
                  }`}
                >
                  <div className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-[#1a1a1a]">
                    {video.thumbnail && (
                      <Image src={video.thumbnail} alt={video.title} fill sizes="40px" className="object-cover" />
                    )}
                    {index === currentIndex && isPlaying && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center gap-0.5">
                        <span className="w-0.5 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-0.5 h-3 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-0.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-medium truncate ${index === currentIndex ? 'text-purple-300' : 'text-slate-200'}`}>
                      {video.title}
                    </p>
                    <p className="text-slate-600 text-xs truncate mt-0.5">{video.channelTitle}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeFromQueue(index) }}
                    className="p-1 text-slate-600 hover:text-red-400 sm:opacity-0 sm:group-hover:opacity-100 transition-all shrink-0"
                    aria-label="Quitar de la cola"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              {queue.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <Music className="w-8 h-8 text-slate-800" />
                  <p className="text-slate-600 text-sm">La cola está vacía</p>
                </div>
              )}
            </div>

            <div className="px-4 py-2.5 border-t border-white/5 shrink-0 space-y-2">
              <button
                onClick={() => setRadioEnabled(!radioEnabled)}
                role="switch"
                aria-checked={radioEnabled}
                className="w-full flex items-center gap-3 text-left"
              >
                <Radio className={`w-4 h-4 shrink-0 ${radioEnabled ? 'text-purple-400' : 'text-slate-600'}`} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-white font-medium">Radio</span>
                  <span className="block text-[11px] text-slate-500">
                    {isRadioLoading
                      ? 'Buscando música parecida...'
                      : 'Al terminar la cola, sigue con música parecida'}
                  </span>
                </span>
                <span
                  className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${radioEnabled ? 'bg-purple-600' : 'bg-white/15'}`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${radioEnabled ? 'left-[18px]' : 'left-0.5'}`}
                  />
                </span>
              </button>
              <p className="text-slate-700 text-xs flex items-center gap-1.5">
                <Plus className="w-3 h-3" />
                Toca + en cualquier tarjeta para añadir a la cola
              </p>
            </div>
          </div>
        )}

        {/* Scrubber bar (área táctil más alta que la barra visible) */}
        <div className="relative h-1.5 sm:h-1 group cursor-pointer bg-white/10">
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-purple-500 to-pink-500 pointer-events-none"
            style={{ width: `${progressPercent}%` }}
          />
          <input
            type="range"
            min={0}
            max={1}
            step={0.0005}
            value={localPlayed}
            onPointerDown={handleSeekStart}
            onChange={handleSeekChange}
            onPointerUp={handleSeekEnd}
            onKeyUp={handleSeekEnd}
            aria-label="Progreso"
            className="absolute inset-x-0 -top-2 -bottom-2 w-full opacity-0 cursor-pointer touch-none"
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg pointer-events-none sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
            style={{ left: `clamp(0px, calc(${progressPercent}% - 6px), calc(100% - 12px))` }}
          />
        </div>

        <div className="bg-black/95 backdrop-blur-xl border-t border-white/10 flex flex-wrap items-center">

          {/* Video — VISIBLE para que YouTube permita el audio. Se puede ampliar o poner a pantalla completa. */}
          <div
            ref={videoWrapRef}
            className={`relative bg-black overflow-hidden ${
              isExpanded
                ? 'w-full aspect-video max-h-[50vh] sm:max-h-[60vh]'
                : 'shrink-0 w-[112px] h-[63px] sm:w-[142px] sm:h-[80px] self-start sm:self-stretch'
            }`}
          >
            {useAudio ? (
              <>
                {currentVideo.thumbnail && (
                  <Image src={currentVideo.thumbnail} alt="" fill sizes="142px" className="object-cover" />
                )}
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                  {isAudioLoading ? (
                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                  ) : (
                    <Headphones className="w-5 h-5 text-white/90 drop-shadow" />
                  )}
                </div>
                <audio
                  ref={playerRef as unknown as React.Ref<HTMLAudioElement>}
                  src={audioUrl}
                  preload="auto"
                  onTimeUpdate={handleTimeUpdate}
                  onDurationChange={handleDurationChange}
                  onLoadedMetadata={handleLoadedMetadata}
                  onEnded={handleEnded}
                  onPlay={handlePlay}
                  onPause={handlePause}
                  onError={handleAudioError}
                />
              </>
            ) : (
              <ReactPlayer {...playerProps} />
            )}
          </div>

          {/* Info + reproducción */}
          <div className="flex-1 flex items-center px-3 sm:px-5 py-1.5 sm:py-2 gap-2 sm:gap-5 min-w-0">
            <div className="min-w-0 flex-1 sm:max-w-xs">
              <p className="text-white text-xs sm:text-sm font-medium leading-tight line-clamp-2 sm:truncate">
                {currentVideo.title}
              </p>
              <p className="text-slate-500 text-xs truncate mt-0.5">
                {audioMode && !useAudio ? (
                  <span className="text-amber-500/90">Audio no disponible · reproduciendo video</span>
                ) : (
                  currentVideo.channelTitle
                )}
              </p>
            </div>

            <div className="flex flex-col items-center gap-0.5 shrink-0 sm:mx-auto">
              <div className="flex items-center gap-1 sm:gap-3">
                <button
                  onClick={playPrev}
                  className="p-2 text-slate-400 hover:text-white transition-colors"
                  title="Anterior"
                  aria-label="Anterior"
                >
                  <SkipBack className="w-4 h-4" />
                </button>

                <button
                  onClick={togglePlay}
                  className="w-10 h-10 sm:w-9 sm:h-9 bg-white hover:bg-slate-100 rounded-full flex items-center justify-center transition-all hover:scale-105 shadow-lg"
                  title={isPlaying ? 'Pausar' : 'Reproducir'}
                  aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4 text-black fill-black" />
                  ) : (
                    <Play className="w-4 h-4 text-black fill-black ml-0.5" />
                  )}
                </button>

                <button
                  onClick={playNext}
                  disabled={isLastInQueue}
                  className="p-2 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Siguiente"
                  aria-label="Siguiente"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              </div>

              <div className="hidden sm:flex items-center gap-1 text-xs text-slate-600 font-mono">
                <span>{formatTime(localPlayed * localDuration)}</span>
                <span>·</span>
                <span>{formatTime(localDuration)}</span>
              </div>
            </div>
          </div>

          {/* Acciones — en móvil ocupan una segunda fila completa */}
          <div className="w-full sm:w-auto flex items-center justify-between sm:justify-end gap-1 sm:gap-2 px-2 sm:px-5 pb-1 sm:pb-0 shrink-0 border-t border-white/5 sm:border-0">
            <span className="sm:hidden max-[359px]:hidden pl-1 text-[11px] text-slate-500 font-mono tabular-nums whitespace-nowrap">
              {formatTime(localPlayed * localDuration)} / {formatTime(localDuration)}
            </span>

            <div className="flex items-center gap-0.5 sm:gap-2">
              <div
                className="flex items-center"
                onMouseEnter={() => setShowVolumeSlider(true)}
                onMouseLeave={() => setShowVolumeSlider(false)}
              >
                <button
                  onClick={toggleMute}
                  className={`${iconBtn} text-slate-400 hover:text-white`}
                  title={isMuted ? 'Activar sonido' : 'Silenciar'}
                  aria-label={isMuted ? 'Activar sonido' : 'Silenciar'}
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-4 h-4" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
                <div
                  className={`hidden md:block overflow-hidden transition-all duration-200 ${showVolumeSlider ? 'w-20 opacity-100' : 'w-0 opacity-0'}`}
                >
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={isMuted ? 0 : volume}
                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                    aria-label="Volumen"
                    className="w-20 accent-purple-500 cursor-pointer"
                  />
                </div>
              </div>

              <button
                onClick={() => currentVideo && toggleSaved(currentVideo)}
                className={`${iconBtn} ${
                  isCurrentSaved ? 'text-pink-500 hover:text-pink-400' : 'text-slate-500 hover:text-white'
                }`}
                title={isCurrentSaved ? 'Quitar de guardadas' : 'Guardar'}
                aria-label={isCurrentSaved ? 'Quitar de guardadas' : 'Guardar'}
                aria-pressed={isCurrentSaved}
              >
                <Heart className={`w-4 h-4 ${isCurrentSaved ? 'fill-pink-500' : ''}`} />
              </button>

              <button
                onClick={() => {
                  const next = !audioBoost
                  setAudioBoost(next)
                  if (next) attachAudioGraph()
                }}
                className={`${iconBtn} ${audioBoost ? 'text-amber-400' : 'text-slate-500 hover:text-white'}`}
                title={audioBoost ? 'Audio mejorado activado' : 'Mejorar audio (compresor + boost)'}
                aria-label="Mejorar audio"
                aria-pressed={audioBoost}
              >
                <Sparkles className="w-4 h-4" />
              </button>

              <button
                onClick={() => switchMode(!audioMode)}
                className={`${iconBtn} ${audioMode ? 'text-purple-400' : 'text-slate-500 hover:text-white'}`}
                title={audioMode ? 'Modo audio: sigue sonando en segundo plano (toca para ver video)' : 'Activar modo audio (segundo plano)'}
                aria-label="Modo audio en segundo plano"
                aria-pressed={audioMode}
              >
                <Headphones className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  if (audioMode) {
                    switchMode(false)
                    setIsExpanded(true)
                  } else {
                    setIsExpanded((v) => !v)
                  }
                }}
                className={`${iconBtn} ${isExpanded ? 'text-purple-400' : 'text-slate-500 hover:text-white'}`}
                title={isExpanded ? 'Reducir video' : 'Ver video'}
                aria-label={isExpanded ? 'Reducir video' : 'Ver video'}
                aria-pressed={isExpanded}
              >
                {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>

              <button
                onClick={() => {
                  if (audioMode) {
                    switchMode(false)
                    setIsExpanded(true)
                  } else {
                    handleFullscreen()
                  }
                }}
                className={`${iconBtn} text-slate-500 hover:text-white`}
                title="Pantalla completa"
                aria-label="Pantalla completa"
              >
                <Maximize className="w-4 h-4" />
              </button>

              <button
                onClick={handlePiP}
                className={`${iconBtn} text-slate-500 hover:text-white hidden sm:flex`}
                title="Picture-in-Picture"
                aria-label="Picture-in-Picture"
              >
                <PictureInPicture2 className="w-4 h-4" />
              </button>

              <button
                onClick={toggleQueue}
                className={`${iconBtn} ${isQueueOpen ? 'text-purple-400' : 'text-slate-500 hover:text-white'}`}
                title={`Cola (${queue.length})`}
                aria-label={`Cola (${queue.length})`}
              >
                <ListMusic className="w-4 h-4" />
              </button>

              <button
                onClick={dismiss}
                className={`${iconBtn} text-slate-600 hover:text-white`}
                title="Cerrar"
                aria-label="Cerrar reproductor"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
