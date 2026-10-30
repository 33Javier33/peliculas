'use client'

import { useShallow } from 'zustand/react/shallow'
import dynamic from 'next/dynamic'
import { useRef, useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import LiveArtwork from '@/components/LiveArtwork'
import { usePathname } from 'next/navigation'
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
  Plus,
  Heart,
  Sparkles,
  Maximize,
  Headphones,
  Loader2,
  Radio,
  Share2,
  ChevronsDownUp,
  TvMinimalPlay,
} from 'lucide-react'
import YoutubePlayer from '@/components/YoutubePlayer'
import { useMusicStore, parseTrackMeta } from '@/store/musicStore'
import { useLiveStore } from '@/store/liveStore'
import { findAudioCandidates, type AudioCandidate } from '@/lib/audio-sources'
import type { MusicVideo } from '@/lib/youtube-music'
import { isLocalTrack, getLocalBlob } from '@/lib/local-music'
import { bestTrack } from '@/lib/track-match'
import { nativeAudioUrl, reportMediaState, isNativeApp } from '@/lib/native'
import NowPlayingSheet from '@/components/NowPlayingSheet'
// react-player v3 — ref is HTMLVideoElement, props use native HTML video API
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ReactPlayer = dynamic(() => import('react-player'), { ssr: false }) as any

// Candidatos de audio por video (compartido entre renders; las URLs duran horas)
const audioCache = new Map<string, Promise<AudioCandidate[]>>()

let audioFailStreak = 0
let audioDownUntil = 0
/** ¿Las fuentes de audio están fallando todas ahora? */
const audioSourcesDown = () => Date.now() < audioDownUntil

function loadAudioCandidates(id: string): Promise<AudioCandidate[]> {
  // App de Android: el propio teléfono saca el audio (no lo bloquea YouTube y es al instante).
  // Si falla, se sigue con las fuentes de siempre (loadWebCandidates).
  const native = nativeAudioUrl(id)
  if (native) return Promise.resolve([{ url: native, mimeType: 'audio/mp4', bitrate: 160000, source: 'device' }])
  return loadWebCandidates(id)
}

function loadWebCandidates(id: string): Promise<AudioCandidate[]> {
  let p = audioCache.get(id)
  if (!p) {
    p = fetch(`/api/audio?id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : { candidates: [] }))
      .then((d: { candidates?: AudioCandidate[] }) => d.candidates ?? [])
      .catch(() => [] as AudioCandidate[])
      // Si el servidor no consigue fuentes (p. ej. bloqueado), lo intenta el propio navegador
      // Si el servidor no trae fuentes públicas (YouTube y los servidores públicos suelen bloquear a
      // Vercel), las busca el propio teléfono: desde su conexión normalmente sí responden
      .then((c) =>
        c.some((x) => x.source !== 'app')
          ? c
          : findAudioCandidates(id)
              .catch(() => [] as AudioCandidate[])
              .then((mine) => [...mine, ...c])
      )
      .then((c) => {
        if (c.length === 0) {
          audioCache.delete(id)
          // Varias canciones seguidas sin audio: por un rato no se espera (se evita la demora)
          if (++audioFailStreak >= 3) audioDownUntil = Date.now() + 10 * 60 * 1000
        } else {
          audioFailStreak = 0
          audioDownUntil = 0
        }
        return c
      })
    audioCache.set(id, p)
  }
  return p
}

// Orden de las fuentes de audio. Normal: M4A primero (compatible con todo). Alta calidad:
// la de más kbps que el navegador pueda reproducir (p. ej. Opus 160 kbps).
function orderCandidates(list: AudioCandidate[], highQuality: boolean): AudioCandidate[] {
  const canPlay = (mime: string) => {
    try {
      return document.createElement('audio').canPlayType(mime) !== ''
    } catch {
      return true
    }
  }
  const playable = list.filter((c) => canPlay(c.mimeType))
  const base = playable.length > 0 ? playable : list
  // El audio propio del servidor va al final: YouTube suele bloquearlo
  const own = (c: AudioCandidate) => (c.source === 'app' ? 1 : 0)
  return [...base].sort(
    (a, b) =>
      own(a) - own(b) ||
      (highQuality
        ? b.bitrate - a.bitrate
        : (b.mimeType === 'audio/mp4' ? 1 : 0) - (a.mimeType === 'audio/mp4' ? 1 : 0) || b.bitrate - a.bitrate)
  )
}

// La sección Música es solo audio (los videos van en la sección Videos)
const MUSIC_AUDIO_ONLY = true
// Tiempo tras pasar a segundo plano en el que una pausa se considera automática (de YouTube)
const AUTO_RESUME_WINDOW_MS = 5000
// Sin avance del audio durante este tiempo: la fuente se considera caída
const STALL_MS = 15000
// Sin empezar a sonar en este tiempo: se prueba la siguiente fuente
const START_MS = 7000
// Radio: más margen antes de reconectar (con señal débil el audio puede tardar en volver solo)
const LIVE_STALL_MS = 25000
const RESUME_KEY = 'cpn-resume-playing'

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
  } = useMusicStore(
    useShallow((s) => ({
      queue: s.queue,
      currentIndex: s.currentIndex,
      isPlaying: s.isPlaying,
      volume: s.volume,
      isMuted: s.isMuted,
      played: s.played,
      isVisible: s.isVisible,
      isQueueOpen: s.isQueueOpen,
      saved: s.saved,
      audioBoost: s.audioBoost,
      hasHydrated: s.hasHydrated,
      playNext: s.playNext,
      playPrev: s.playPrev,
      togglePlay: s.togglePlay,
      setIsPlaying: s.setIsPlaying,
      setVolume: s.setVolume,
      toggleMute: s.toggleMute,
      setPlayed: s.setPlayed,
      setDuration: s.setDuration,
      registerSeek: s.registerSeek,
      toggleQueue: s.toggleQueue,
      dismiss: s.dismiss,
      playIndex: s.playIndex,
      removeFromQueue: s.removeFromQueue,
      toggleSaved: s.toggleSaved,
      setAudioBoost: s.setAudioBoost,
      audioMode: s.audioMode,
      setAudioMode: s.setAudioMode,
      radioEnabled: s.radioEnabled,
      setRadioEnabled: s.setRadioEnabled,
      appendToQueue: s.appendToQueue,
      consumeResume: s.consumeResume,
    }))
  )

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
    if (!radioEnabled || !isLastTrack || !currentVideo || currentVideo.streamUrl || radioSeedRef.current === currentVideo.id) return
    // Discos y listas de enlaces: no se mezclan canciones de YouTube al final
    if (currentVideo.audioUrl) return
    // Con "repetir todo" la cola vuelve a empezar: la radio no añade canciones
    if (useMusicStore.getState().repeatMode === 'all') return
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

    // Primero, más canciones del MISMO artista o grupo (lo que se espera de una app de música);
    // solo si no hay, canciones parecidas de otros artistas
    const songKey = (t: MusicVideo) => normSong(t.title.replace(/^[^-–]+[-–]\s*/, ''))
    const inQueue = new Set(useMusicStore.getState().queue.map(songKey))
    const artistParams = currentVideo.artistId
      ? `id=${currentVideo.artistId}`
      : currentArtist
        ? `name=${encodeURIComponent(currentArtist.replace(/\s*-\s*topic$/i, '').replace(/vevo$/i, ''))}`
        : ''
    const sameArtist: Promise<MusicVideo[]> = artistParams
      ? fetch(`/api/catalog/artist-tracks?${artistParams}`)
          .then((r) => (r.ok ? r.json() : { tracks: [] }))
          .then((d: { tracks?: MusicVideo[] }) => (d.tracks ?? []).filter((t) => !inQueue.has(songKey(t))))
          .catch(() => [])
      : Promise.resolve([])

    sameArtist
      .then(async (own) => {
        if (own.length >= 3) return { videos: own.slice(0, 20) }
        const r = await fetch(`/api/youtube/for-you?${params.toString()}`)
        return r.ok ? ((await r.json()) as { videos?: MusicVideo[] }) : null
      })
      .then((data: { videos?: MusicVideo[] } | null) => {
        const list = data?.videos ?? []
        // Preferimos lo que no has escuchado nunca; si queda poco, se completa con lo demás
        const heard = new Set(useMusicStore.getState().history.map((h) => h.id))
        const fresh = list.filter((v) => !heard.has(v.id))
        const added = appendToQueue((fresh.length >= 5 ? fresh : list).slice(0, 20))
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
  // Radio en vivo: siempre por <audio> con su stream directo
  const isLive = !!currentVideo?.streamUrl
  // ===== Canciones del catálogo "pendientes": se busca su video justo antes de sonar =====
  // (así un disco o un artista empieza a sonar al instante, sin esperar a buscar todo)
  const pendingTrack = currentVideo?.pending ? currentVideo : null
  useEffect(() => {
    if (!pendingTrack) return
    const pendingId = pendingTrack.id
    resolvePendingId(pendingTrack).then((id) => {
      const st = useMusicStore.getState()
      if (st.queue[st.currentIndex]?.id !== pendingId) return
      if (id) st.resolvePending(pendingId, id)
      else skipUnplayableRef.current(pendingId)
    })
    // Se adelanta la búsqueda de las dos siguientes
    const st = useMusicStore.getState()
    st.queue.slice(st.currentIndex + 1, st.currentIndex + 3).forEach((t) => t.pending && resolvePendingId(t))
  }, [pendingTrack])
  // Y si la que suena ya está lista, se preparan las siguientes pendientes
  useEffect(() => {
    if (!currentId || currentVideo?.pending) return
    const st = useMusicStore.getState()
    st.queue.slice(st.currentIndex + 1, st.currentIndex + 3).forEach((t) => {
      if (t.pending) resolvePendingId(t).then((id) => id && useMusicStore.getState().resolvePending(t.id, id))
    })
  }, [currentId, currentVideo?.pending])

  // Música guardada en el teléfono: siempre por <audio> (suena sin conexión y bloqueado)
  const isLocalFile = isLocalTrack(currentId)
  // Archivo de audio desde un enlace (MP3, M4A…): también por <audio>, suena bloqueado
  const remoteFileUrl = currentVideo?.audioUrl
  const isLocal = isLocalFile || !!remoteFileUrl
  const [localUrl, setLocalUrl] = useState<{ id: string; url: string } | null>(null)
  useEffect(() => {
    if (!isLocalFile || !currentId) return
    let url = ''
    let cancelled = false
    getLocalBlob(currentId).then((blob) => {
      if (cancelled) return
      if (!blob) return skipUnplayableRef.current(currentId)
      url = URL.createObjectURL(blob)
      setLocalUrl({ id: currentId, url })
    })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [isLocalFile, currentId])
  // Mientras se busca el video de una canción pendiente se muestra "cargando" (como el modo audio)
  const isPending = !!currentVideo?.pending
  // Inicio rápido: si el audio para segundo plano tarda más de 2,5 s, la canción empieza con
  // YouTube y pasa al audio propio al bloquear la pantalla o salir de la app (si ya está listo).
  // Los videos (no canciones) se ven en la ventana chica; las canciones van en audio
  const wantAudio = !!currentId && !currentVideo?.isVideo && !audioFailedIds.has(currentId) && !audioSourcesDown()
  const [quickStartId, setQuickStartId] = useState<string | null>(null)
  const [audioSwitchId, setAudioSwitchId] = useState<string | null>(null)
  // Video en pantalla que pasa a audio propio al salir de la app o bloquear (y vuelve al video al regresar)
  const [bgAudioId, setBgAudioId] = useState<string | null>(null)
  const bgActiveRef = useRef(false)
  // ¿Sonaba algo al salir de la app o bloquear? (aunque YouTube se haya pausado solo después)
  const hiddenWantRef = useRef(false)
  // Ventana de video: flotante sobre la barra; "oculta" = de vuelta en la miniatura de la barra
  const [videoHidden, setVideoHidden] = useState(false)
  // Video de la canción abierto aparte (reproductor de Videos)
  const [videoModal, setVideoModal] = useState<{ id: string; title: string; channelTitle: string; startTime: number } | null>(null)
  // Ver el video desde donde va la canción (y al cerrarlo, la canción sigue desde donde quedó el video)
  const openVideo = useCallback(() => {
    const st = useMusicStore.getState()
    const v = st.queue[st.currentIndex]
    if (!v) return
    const el = playerRef.current as unknown as HTMLMediaElement | null
    const startTime = el && isFinite(el.currentTime) ? el.currentTime : 0
    setVideoModal({ id: v.id, title: v.title, channelTitle: v.channelTitle, startTime })
  }, [])
  const closeVideo = useCallback((t?: number) => {
    setVideoModal(null)
    const el = playerRef.current as unknown as HTMLMediaElement | null
    if (el && typeof t === 'number' && t > 0 && isFinite(el.duration) && el.duration > 0) {
      el.currentTime = Math.min(t, el.duration - 1)
    }
    useMusicStore.getState().setIsPlaying(true)
  }, [])
  const useAudio =
    isLive ||
    isLocal ||
    isPending ||
    bgAudioId === currentId ||
    (wantAudio && (quickStartId !== currentId || audioSwitchId === currentId))
  const useAudioRef = useRef(useAudio)
  useAudioRef.current = useAudio
  const audioUrl = isLive
    ? currentVideo?.streamUrl
    : isPending
      ? undefined
      : remoteFileUrl
      ? remoteFileUrl
      : isLocal
      ? localUrl?.id === currentId
        ? localUrl.url
        : undefined
      : useAudio && audioSrc?.id === currentId
      ? audioSrc.candidates[audioSrc.index]?.url
      : undefined
  const isAudioLoading = useAudio && !audioUrl

  // Canción que no se puede reproducir: se salta para que la música siga fluida
  const [skipNotice, setSkipNotice] = useState<string | null>(null)
  const skipUnplayable = useCallback((id: string) => {
    const st = useMusicStore.getState()
    const cur = st.queue[st.currentIndex]
    if (!cur || cur.id !== id) return
    pendingSeekRef.current = -1
    setSkipNotice(cur.title)
    if (st.currentIndex < st.queue.length - 1) st.playNext()
    else if (st.radioEnabled) waitingForRadioRef.current = true
  }, [])

  const skipUnplayableRef = useRef(skipUnplayable)
  skipUnplayableRef.current = skipUnplayable

  useEffect(() => {
    if (!skipNotice) return
    const t = setTimeout(() => setSkipNotice(null), 4000)
    return () => clearTimeout(t)
  }, [skipNotice])


  // YouTube no deja reproducir este video (bloqueado fuera de YouTube, eliminado, de otro país):
  // se busca otra subida de la misma canción antes de saltarla.
  const altTriedRef = useRef<Map<string, Set<string>>>(new Map())
  const tryAlternative = useCallback(
    async (failedId: string, maxTries = 4): Promise<boolean> => {
      const st = useMusicStore.getState()
      const index = st.currentIndex
      const track = st.queue[index]
      if (!track || track.id !== failedId || track.streamUrl) return false
      const tried = altTriedRef.current.get(track.title) ?? new Set<string>()
      tried.add(failedId)
      altTriedRef.current.set(track.title, tried)
      if (tried.size > maxTries) return false
      setSkipNotice(null)
      const altId = await findAlternativeId(track, tried)
      const now = useMusicStore.getState()
      if (!altId || now.currentIndex !== index || now.queue[index]?.id !== failedId) return false
      tried.add(altId)
      now.replaceTrackId(index, altId)
      return true
    },
    []
  )
  const tryAlternativeOrSkip = useCallback(
    async (failedId: string) => {
      if (!(await tryAlternative(failedId))) skipUnplayable(failedId)
    },
    [tryAlternative, skipUnplayable]
  )

  // Sin audio para segundo plano: primero se prueba otra subida de la misma canción (cuyo audio
  // sí se pueda obtener). Si no hay, con la app abierta suena con el reproductor de YouTube; con
  // la pantalla bloqueada (donde YouTube no suena) se pasa a la siguiente para no quedar en silencio.
  const markAudioFailed = useCallback(
    async (id: string) => {
      const t = useMusicStore.getState().queue.find((x) => x.id === id)
      if (isLocalTrack(id) || t?.audioUrl) return skipUnplayable(id)
      // (Antes se buscaba otra subida de la canción: casi nunca ayudaba y demoraba cada canción)
      const st = useMusicStore.getState()
      if (st.queue[st.currentIndex]?.id !== id) return
      if (document.visibilityState === 'hidden') skipUnplayable(id)
      else setAudioFailedIds((prev) => new Set(prev).add(id))
    },
    [tryAlternative, skipUnplayable]
  )

  useEffect(() => {
    // En modo video también se prepara el audio (con unos segundos de margen): así al salir de
    // la app o bloquear el teléfono el video sigue sonando
    if (!currentId || isLive || isLocal || isPending || audioFailedIds.has(currentId)) return
    if (audioSrc?.id === currentId) return
    let cancelled = false
    const delay = wantAudio || document.visibilityState === 'hidden' ? 0 : 4000
    const timer = setTimeout(() =>
    loadAudioCandidates(currentId).then((candidates) => {
      if (cancelled) return
      if (candidates.length === 0) {
        if (wantAudio) markAudioFailed(currentId)
        return
      }
      setAudioSrc({ id: currentId, candidates: orderCandidates(candidates, useMusicStore.getState().audioBoost), index: 0 })
    }), delay)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [wantAudio, currentId, audioSrc?.id, markAudioFailed, isLive, isLocal, isPending, audioFailedIds])

  const audioReady = audioSrc?.id === currentId
  useEffect(() => {
    // Música: sin inicio con video de YouTube (se espera el audio, que sigue sonando al bloquear)
    if (MUSIC_AUDIO_ONLY || !wantAudio || audioReady || !currentId || isLive || isLocal || isPending) return
    const id = currentId
    const t = setTimeout(() => {
      // Con la pantalla bloqueada YouTube no suena: ahí se sigue esperando el audio
      if (document.visibilityState === 'visible') setQuickStartId(id)
    }, 2500)
    return () => clearTimeout(t)
  }, [wantAudio, audioReady, currentId, isLive, isLocal, isPending])

  // Al salir de la app con la canción sonando por YouTube: se pasa al audio propio (sigue donde iba)
  const localPlayedRef = useRef(0)
  localPlayedRef.current = localPlayed
  useEffect(() => {
    const switchIfNeeded = () => {
      const st = useMusicStore.getState()
      if (document.visibilityState === 'hidden') {
        // Sonaba al bloquear (YouTube ya pudo haberse pausado solo): se sigue con el audio propio
        if (!(st.isPlaying || hiddenWantRef.current) || useAudioRef.current) return
        // Siguiente pista con la pantalla bloqueada: también por audio propio
        if (bgActiveRef.current && currentId) return setBgAudioId(currentId)
        if (!audioReady) return
        pendingSeekRef.current = localPlayedRef.current
        if (!st.isPlaying) st.setIsPlaying(true)
        if (quickStartId && quickStartId === currentId) setAudioSwitchId(currentId)
        else {
          bgActiveRef.current = true
          setBgAudioId(currentId ?? null)
        }
      } else if (bgActiveRef.current) {
        // De vuelta en la app: otra vez el video, desde donde iba
        bgActiveRef.current = false
        if (bgAudioId === currentId) pendingSeekRef.current = localPlayedRef.current
        setBgAudioId(null)
      }
    }
    switchIfNeeded()
    document.addEventListener('visibilitychange', switchIfNeeded)
    return () => document.removeEventListener('visibilitychange', switchIfNeeded)
  }, [quickStartId, currentId, audioReady, audioSwitchId, bgAudioId])

  // Pre-carga la siguiente canción para que el cambio sea inmediato con la pantalla bloqueada
  const nextTrack = queue[currentIndex + 1]
  const nextId =
    nextTrack && !nextTrack.streamUrl && !nextTrack.pending && !nextTrack.audioUrl && !isLocalTrack(nextTrack.id) ? nextTrack.id : undefined
  useEffect(() => {
    if (audioMode && nextId) loadAudioCandidates(nextId)
  }, [audioMode, nextId])

  // ===== Radio en vivo: reconectar en vez de saltar =====
  // Las emisoras cortan la conexión a veces (cambio de Wi-Fi a datos, servidor que reinicia,
  // señal débil). Si la radio ya estaba sonando, se vuelve a conectar a la misma emisora;
  // solo se salta a la siguiente si nunca llegó a sonar.
  const liveStartedRef = useRef(false)
  const liveRetriesRef = useRef(0)
  const liveRetryTimer = useRef<ReturnType<typeof setTimeout>>()
  const [reconnecting, setReconnecting] = useState(false)
  const reconnectingRef = useRef(false)
  reconnectingRef.current = reconnecting
  useEffect(() => {
    liveStartedRef.current = false
    liveRetriesRef.current = 0
    clearTimeout(liveRetryTimer.current)
    setReconnecting(false)
  }, [currentId])
  const reconnectLive = useCallback(() => {
    const url = currentVideo?.streamUrl
    if (!url) return
    clearTimeout(liveRetryTimer.current)
    setReconnecting(true)
    const wait = Math.min(30000, 1500 * 2 ** liveRetriesRef.current)
    liveRetriesRef.current++
    liveRetryTimer.current = setTimeout(() => {
      const el = playerRef.current as unknown as HTMLAudioElement | null
      if (!el || !useMusicStore.getState().isPlaying) return
      el.src = url
      el.load()
      el.play().catch(() => {})
    }, wait)
  }, [currentVideo?.streamUrl])

  const handleAudioError = useCallback(() => {
    if (isLocal && currentId) return skipUnplayable(currentId)
    if (isLive && currentId) {
      if (liveStartedRef.current) return reconnectLive()
      // Emisora que no llega a sonar: pasar a la siguiente o detener
      const st = useMusicStore.getState()
      if (st.currentIndex < st.queue.length - 1) skipUnplayable(currentId)
      else {
        setSkipNotice(st.queue[st.currentIndex]?.title ?? null)
        st.setIsPlaying(false)
      }
      return
    }
    if (!audioSrc || audioSrc.id !== currentId) return
    if (audioSrc.index + 1 < audioSrc.candidates.length) {
      pendingSeekRef.current = useMusicStore.getState().played
      setAudioSrc({ ...audioSrc, index: audioSrc.index + 1 })
    } else if (audioSrc.candidates[audioSrc.index]?.source === 'device') {
      // La app de Android no pudo sacar el audio: se prueban las fuentes de internet
      const { id } = audioSrc
      pendingSeekRef.current = useMusicStore.getState().played
      loadWebCandidates(id).then((list) => {
        const st = useMusicStore.getState()
        if (st.queue[st.currentIndex]?.id !== id) return
        if (list.length) setAudioSrc({ id, candidates: orderCandidates(list, st.audioBoost), index: 0 })
        else markAudioFailed(id)
      })
    } else {
      audioCache.delete(audioSrc.id)
      markAudioFailed(audioSrc.id)
    }
  }, [audioSrc, currentId, markAudioFailed, isLive, isLocal, skipUnplayable, reconnectLive])

  // Vigilante: si el audio no avanza en 15 s (fuente caída o que no carga), probar otra o saltar
  const lastProgressRef = useRef(Date.now())
  const handleAudioErrorRef = useRef(handleAudioError)
  handleAudioErrorRef.current = handleAudioError
  useEffect(() => {
    if (!useAudio || !isPlaying || !currentId) return
    lastProgressRef.current = Date.now()
    let lastTime = -1
    const timer = setInterval(() => {
      // Interrumpida por otra app (WhatsApp, llamada) o buscando la canción: no es una fuente caída
      if (interruptedAtRef.current || useMusicStore.getState().queue[useMusicStore.getState().currentIndex]?.pending) {
        lastProgressRef.current = Date.now()
        return
      }
      // Se mira el avance real del audio (no solo el evento timeupdate, que con la pantalla
      // apagada puede llegar tarde y hacía creer que la radio se había cortado)
      const el = playerRef.current as unknown as HTMLAudioElement | null
      if (el && !el.paused && el.currentTime !== lastTime) {
        if (lastTime >= 0) lastProgressRef.current = Date.now()
        lastTime = el.currentTime
      }
      // Una fuente que no arranca en 7 s se cambia por la siguiente (antes se esperaban 15 s)
      const limit = isLive ? LIVE_STALL_MS : lastTime <= 0 ? START_MS : STALL_MS
      if (Date.now() - lastProgressRef.current < limit) return
      lastProgressRef.current = Date.now()
      if (audioUrl) handleAudioErrorRef.current()
      else markAudioFailed(currentId)
    }, 3000)
    return () => clearInterval(timer)
  }, [useAudio, isPlaying, currentId, audioUrl, markAudioFailed, isLive])

  // Al volver la conexión (cambio de Wi-Fi a datos, túnel…) la radio se reconecta al instante
  useEffect(() => {
    if (!isLive) return
    const onOnline = () => {
      const el = playerRef.current as unknown as HTMLAudioElement | null
      if (!el || !useMusicStore.getState().isPlaying) return
      liveRetriesRef.current = 0
      reconnectLive()
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [isLive, reconnectLive])

  // ===== Seguir sonando al recargar la página =====
  const [needsTap, setNeedsTap] = useState(false)
  const autoResumingRef = useRef(false)
  useEffect(() => {
    const save = () => {
      try {
        sessionStorage.setItem(RESUME_KEY, useMusicStore.getState().isPlaying ? '1' : '0')
      } catch {}
    }
    window.addEventListener('pagehide', save)
    return () => window.removeEventListener('pagehide', save)
  }, [])

  const resumeTriedRef = useRef(false)
  useEffect(() => {
    if (!hasHydrated || resumeTriedRef.current) return
    resumeTriedRef.current = true
    let flag: string | null = null
    try {
      flag = sessionStorage.getItem(RESUME_KEY)
      sessionStorage.removeItem(RESUME_KEY)
    } catch {}
    if (flag === '1' && useMusicStore.getState().isVisible) {
      autoResumingRef.current = true
      setIsPlaying(true)
    }
  }, [hasHydrated, setIsPlaying])

  // Si el navegador bloquea el inicio automático, sigue con el primer toque en cualquier parte
  const handleAutoplayBlocked = useCallback(() => {
    setIsPlaying(false)
    if (!autoResumingRef.current) return
    autoResumingRef.current = false
    setNeedsTap(true)
    const resume = () => {
      setNeedsTap(false)
      setIsPlaying(true)
    }
    document.addEventListener('pointerdown', resume, { once: true, capture: true })
  }, [setIsPlaying])

  // Alta calidad: reordena las fuentes y, si cambia la mejor, sigue en el mismo segundo
  const currentCandidate = audioSrc?.id === currentId ? audioSrc?.candidates[audioSrc.index] : undefined
  const currentBitrate = currentCandidate?.bitrate ? Math.round(currentCandidate.bitrate / 1000) : 0
  const toggleHighQuality = () => {
    const next = !useMusicStore.getState().audioBoost
    setAudioBoost(next)
    if (!useAudio || isLive || !audioSrc || audioSrc.id !== currentId) return
    const ordered = orderCandidates(audioSrc.candidates, next)
    if (ordered[0]?.url !== audioSrc.candidates[audioSrc.index]?.url) {
      pendingSeekRef.current = useMusicStore.getState().played
      setAudioSrc({ id: audioSrc.id, candidates: ordered, index: 0 })
    }
  }

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
  // Música es solo audio: si quedó guardado el modo video de versiones anteriores, se vuelve a audio
  useEffect(() => {
    if (!useMusicStore.getState().audioMode) setAudioMode(true)
  }, [setAudioMode])

  // Radio en vivo: el corazón guarda la emisora en "Mis radios favoritas"
  const { favoriteRadios, toggleFavoriteRadio } = useLiveStore()
  const isCurrentSaved = currentVideo
    ? (isLive ? favoriteRadios : saved).some((t) => t.id === currentVideo.id)
    : false
  const hasResumedRef = useRef(false)

  useEffect(() => {
    const el = playerRef.current
    if (!useAudio || !el || !audioUrl) return
    if (isPlaying && el.paused) {
      el.play()
        .then(() => {
          autoResumingRef.current = false
        })
        .catch((err: DOMException) => {
          if (err?.name === 'NotAllowedError') handleAutoplayBlocked()
        })
    } else if (!isPlaying && !el.paused) {
      el.pause()
    }
  }, [useAudio, audioUrl, isPlaying, handleAutoplayBlocked])

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

  const lastPlayedSaveRef = useRef(0)
  const startAppliedRef = useRef<string | null>(null)
  // react-player v3: onTimeUpdate receives a React.SyntheticEvent<HTMLMediaElement>
  const handleTimeUpdate = useCallback(
    (e: React.SyntheticEvent<HTMLMediaElement>) => {
      const el = e.currentTarget
      const st = useMusicStore.getState()
      const cur = st.queue[st.currentIndex]
      // Ya suena: la tarjeta tocada deja de mostrar "cargando"
      if (el.currentTime > 0.2 && cur && st.soundingId !== cur.id) st.setSoundingId(cur.id)
      const live = !!cur?.streamUrl
      if (!live && !isSeeking && isFinite(el.duration) && el.duration > 0) {
        const fraction = el.currentTime / el.duration
        setLocalPlayed(fraction)
        // La posición global (que guarda el teléfono y leen otras pantallas) se actualiza 1 vez por segundo
        const now = Date.now()
        if (now - lastPlayedSaveRef.current > 1000) {
          lastPlayedSaveRef.current = now
          setPlayed(fraction)
        }
      }
      lastProgressRef.current = Date.now()
      if (el.currentTime > 0 && !liveStartedRef.current) liveStartedRef.current = true
      if (liveRetriesRef.current > 0 && el.currentTime > 0) {
        liveRetriesRef.current = 0
        setReconnecting(false)
      }
    },
    [isSeeking, setPlayed]
  )

  const handleDurationChange = useCallback(
    (e: React.SyntheticEvent<HTMLMediaElement>) => {
      // Radio en vivo: la "duración" crece sin parar mientras llega el audio; no se usa.
      // (Guardarla en cada cambio recalculaba toda la app muchas veces por segundo y cortaba el sonido.)
      if (useMusicStore.getState().queue[useMusicStore.getState().currentIndex]?.streamUrl) return
      const d = e.currentTarget.duration
      if (isFinite(d) && d > 0 && Math.abs(d - useMusicStore.getState().duration) > 0.5) {
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
        hiddenWantRef.current = isPlayingRef.current
        if (keepPlayingRef.current) {
          for (const ms of [250, 800, 1600, 3000]) timers.push(setTimeout(resumeIfNeeded, ms))
          // Canción que solo suena con YouTube (sin audio para segundo plano) y YouTube se detuvo
          // al bloquear: se pasa a la siguiente (con audio propio) en vez de quedar en silencio
          timers.push(
            setTimeout(() => {
              const st = useMusicStore.getState()
              const el = playerRef.current
              if (!useAudioRef.current && hiddenWantRef.current && el?.paused && document.visibilityState === 'hidden') {
                if (st.currentIndex < st.queue.length - 1) st.playNext()
              }
              // (antes se esperan 12 s: si el audio de esta canción llega, se pasa a él sin saltarla)
            }, 12000)
          )
        }
      } else {
        timers.splice(0).forEach(clearTimeout)
        hiddenAtRef.current = 0
        hiddenWantRef.current = false
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

  // ===== Reanudar después de una interrupción de otra app =====
  // Android le devuelve el audio a la app cuando la otra termina y el navegador reanuda solo.
  // Por si no lo hace: al volver a la app se reanuda al instante y, con la app en segundo plano,
  // se reintenta con calma (cada 20 s, para no sonar encima de un audio que se esté grabando).
  const interruptedAtRef = useRef(0)
  useEffect(() => {
    const tryResume = () => {
      const el = playerRef.current
      const st = useMusicStore.getState()
      if (!interruptedAtRef.current || !useAudioRef.current || !st.isPlaying || !el?.paused) return
      if (Date.now() - interruptedAtRef.current > 30 * 60 * 1000) {
        interruptedAtRef.current = 0
        st.setIsPlaying(false)
        return
      }
      el.play().catch(() => {})
    }
    const timer = setInterval(() => {
      const since = Date.now() - interruptedAtRef.current
      // Primer intento a los 20 s y luego cada 20 s
      if (interruptedAtRef.current && since >= 20000 && since % 20000 < 5000) tryResume()
    }, 5000)
    const onVisible = () => document.visibilityState === 'visible' && tryResume()
    document.addEventListener('visibilitychange', onVisible)
    // Si justo después de la pausa se desconectaron los audífonos, era eso: queda en pausa
    onUnplug = () => {
      if (interruptedAtRef.current && Date.now() - interruptedAtRef.current < 3000) {
        interruptedAtRef.current = 0
        useMusicStore.getState().setIsPlaying(false)
      }
    }
    return () => {
      onUnplug = null
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const handleEnded = useCallback(() => {
    const { queue: q, currentIndex: i, repeatMode } = useMusicStore.getState()
    // Una radio en vivo no "termina": si el servidor corta, se vuelve a conectar
    if (q[i]?.streamUrl) return reconnectLive()
    if (repeatMode === 'one') {
      const el = playerRef.current
      if (el) {
        el.currentTime = 0
        el.play()?.catch?.(() => {})
      }
      return
    }
    if (i >= q.length - 1 && isRadioLoadingRef.current) waitingForRadioRef.current = true
    playNext()
  }, [playNext, reconnectLive])
  const handlePlay = useCallback(() => {
    interruptedAtRef.current = 0
    setIsPlaying(true)
  }, [setIsPlaying])
  const handlePause = useCallback((e?: React.SyntheticEvent<HTMLMediaElement>) => {
    // Al terminar una canción también llega "pause": lo gestiona onEnded
    if (e?.currentTarget?.ended) return
    // Pausa causada por la reconexión de una radio: no es del usuario
    if (reconnectingRef.current) return
    if (useAudioRef.current) {
      // Si la app todavía "quiere" sonar, la pausa no la pidió el usuario (los botones y la
      // pantalla de bloqueo cambian primero el estado): la cortó otra app, p. ej. al grabar o
      // escuchar un audio de WhatsApp, una llamada o una alarma. Se reanuda sola después.
      if (useMusicStore.getState().isPlaying && !unpluggedRecently()) {
        interruptedAtRef.current = Date.now()
        return
      }
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
      // Video que se venía viendo en grande: sigue desde ese segundo
      const st = useMusicStore.getState()
      const cur = st.queue[st.currentIndex]
      if (cur?.startAt && startAppliedRef.current !== cur.id) {
        startAppliedRef.current = cur.id
        el.currentTime = cur.startAt
        hasResumedRef.current = true
        return
      }
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
          hiddenWantRef.current = false
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

  // ===== Pantalla completa "Reproduciendo ahora" =====
  const [isFullOpen, setIsFullOpen] = useState(false)
  const openFull = useCallback(() => {
    setIsFullOpen(true)
    // Entrada en el historial para que el botón "atrás" de Android cierre el reproductor.
    // Se copia el estado de Next.js para que su router no recargue la página.
    try {
      window.history.pushState({ ...window.history.state, cpnFullPlayer: true }, '')
    } catch {}
  }, [])
  const closeFull = useCallback(() => {
    if (window.history.state?.cpnFullPlayer) window.history.back()
    else setIsFullOpen(false)
  }, [])
  useEffect(() => {
    const onPop = () => setIsFullOpen(!!window.history.state?.cpnFullPlayer)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  useEffect(() => {
    if (!isBarShown) setIsFullOpen(false)
  }, [isBarShown])

  // Abrir la pantalla completa cuando otra parte de la app lo pide (enlace compartido)
  const fullPlayerRequested = useMusicStore((s) => s.fullPlayerRequested)
  const pathname = usePathname()
  useEffect(() => {
    // Esperar a salir de /play/… para que la entrada del historial quede en la página de destino
    if (!fullPlayerRequested || !isBarShown || pathname.startsWith('/play')) return
    useMusicStore.getState().requestFullPlayer(false)
    openFull()
  }, [fullPlayerRequested, isBarShown, openFull, pathname])

  const seekFraction = useCallback(
    (fraction: number) => {
      const el = playerRef.current
      if (el && isFinite(el.duration) && el.duration > 0) el.currentTime = fraction * el.duration
      setPlayed(fraction)
      setLocalPlayed(fraction)
    },
    [setPlayed]
  )

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

  // Video a la vista: ventana chica flotante sobre la barra (salvo ampliado o achicado a la barra)
  const floating = !useAudio && !isExpanded && !videoHidden && !isLive && !!currentVideo?.isVideo
  useEffect(() => setVideoHidden(false), [currentId])
  const [shareNotice, setShareNotice] = useState(false)
  const shareCurrent = useCallback(async () => {
    const v = useMusicStore.getState().queue[useMusicStore.getState().currentIndex]
    if (!v) return
    const url = `${window.location.origin}/play/${v.id}`
    const text = `Mira "${v.title}" en Carlos P. Nauto Interactive`
    try {
      if (navigator.share) await navigator.share({ title: v.title, text, url })
      else {
        await navigator.clipboard.writeText(`${text}\n${url}`)
        setShareNotice(true)
        setTimeout(() => setShareNotice(false), 2000)
      }
    } catch {}
  }, [])

  // App de Android: notificación con controles y pantalla bloqueada
  useEffect(() => {
    if (!isNativeApp()) return
    reportMediaState({
      title: currentVideo ? currentVideo.title.replace(/^[^-–]+[-–]\s*/, '') || currentVideo.title : '',
      artist: currentVideo?.channelTitle || '',
      artwork: currentVideo?.thumbnail?.startsWith('http') ? currentVideo.thumbnail : undefined,
      playing: isPlaying,
      visible: isVisible && !!currentVideo,
    })
  }, [currentVideo, isPlaying, isVisible])
  useEffect(() => {
    if (!isNativeApp()) return
    ;(window as unknown as { __cpnNativeAction?: (a: string) => void }).__cpnNativeAction = (a: string) => {
      const st = useMusicStore.getState()
      if (a === 'play') st.setIsPlaying(true)
      else if (a === 'pause') st.setIsPlaying(false)
      else if (a === 'next') st.playNext()
      else if (a === 'prev') st.playPrev()
    }
  }, [])

  // ¿La canción tiene video de YouTube? (no radios, archivos ni canciones aún sin buscar)
  const canWatchVideo = !!currentVideo && !isLive && !isLocal && !isPending && /^[A-Za-z0-9_-]{11}$/.test(currentVideo.id)

  if (!isBarShown) return null

  const progressPercent = isLive ? 100 : localPlayed * 100
  // Siguiente sigue disponible en la última si se repite todo o la radio traerá más
  const isLastInQueue =
    currentIndex >= queue.length - 1 && useMusicStore.getState().repeatMode !== 'all' && !(radioEnabled && !isLive && !currentVideo?.audioUrl)

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
    // Video que YouTube no deja reproducir aquí (p. ej. inserción desactivada): saltar
    onError: () => currentVideo && tryAlternativeOrSkip(currentVideo.id),
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
      {videoModal && (
        <YoutubePlayer
          videoId={videoModal.id}
          title={videoModal.title}
          channelTitle={videoModal.channelTitle}
          startTime={videoModal.startTime}
          onClose={closeVideo}
        />
      )}
      {/* Reserva el alto del reproductor para que no tape el contenido ni el footer */}
      <div aria-hidden style={{ height: barHeight }} />

      <NowPlayingSheet
        open={isFullOpen}
        onClose={closeFull}
        onOpenQueue={() => {
          closeFull()
          if (!useMusicStore.getState().isQueueOpen) toggleQueue()
        }}
        onWatchVideo={
          canWatchVideo
            ? () => {
                closeFull()
                openVideo()
              }
            : undefined
        }
        onSwitchMode={(toAudio) => {
          if (toAudio) {
            switchMode(true)
          } else {
            closeFull()
            switchMode(false)
            setIsExpanded(true)
          }
        }}
        isAudioLoading={isAudioLoading}
        played={localPlayed}
        duration={localDuration}
        onSeek={seekFraction}
      />

      {/* ===== PLAYER BAR ===== */}
      <div ref={barRef} className="fixed bottom-14 sm:bottom-0 left-0 right-0 z-[80] select-none">
        {(skipNotice || needsTap) && !isQueueOpen && (
          <div className="absolute bottom-full left-0 right-0 flex justify-center px-3 pb-2 pointer-events-none">
            <p className="max-w-full truncate bg-surface-2/[0.98] sm:bg-surface-2/95 sm:backdrop-blur-xl border border-white/10 text-slate-200 text-xs font-medium px-4 py-2 rounded-full shadow-lg">
              {needsTap ? 'Toca la pantalla para continuar la música' : `No disponible, saltando: ${skipNotice}`}
            </p>
          </div>
        )}

        {/* ===== QUEUE PANEL ===== */}
        {isQueueOpen && (
          <div className="absolute bottom-full right-0 sm:right-4 sm:mb-2 w-full sm:w-80 max-h-[50vh] sm:max-h-[340px] bg-surface-1/[0.98] sm:bg-surface-1/95 sm:backdrop-blur-xl sm:backdrop-saturate-[1.8] border border-white/10 sm:rounded-xl overflow-hidden shadow-2xl shadow-black/80 flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2">
                <ListMusic className="w-4 h-4 text-violet-400" />
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
                      ? 'bg-violet-500/15 border-l-2 border-violet-500'
                      : 'hover:bg-white/5 border-l-2 border-transparent'
                  }`}
                >
                  <div className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-surface-2">
                    {video.thumbnail && (
                      <Image src={video.thumbnail} alt={video.title} fill sizes="40px" className="object-cover" unoptimized={!!video.streamUrl} />
                    )}
                    {index === currentIndex && isPlaying && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center gap-0.5">
                        <span className="w-0.5 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-0.5 h-3 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-0.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-medium truncate ${index === currentIndex ? 'text-emerald-400' : 'text-slate-200'}`}>
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
                <Radio className={`w-4 h-4 shrink-0 ${radioEnabled ? 'text-violet-400' : 'text-slate-600'}`} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-white font-medium">Radio</span>
                  <span className="block text-[11px] text-slate-500">
                    {isRadioLoading
                      ? 'Buscando música parecida...'
                      : 'Al terminar la cola, sigue con música parecida'}
                  </span>
                </span>
                <span
                  className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${radioEnabled ? 'bg-violet-600' : 'bg-white/15'}`}
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
        <div className="relative h-1.5 sm:h-1 group cursor-pointer bg-white/12">
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-violet-500 to-purple-500 pointer-events-none"
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
            disabled={isLive}
            aria-label="Progreso"
            className="absolute inset-x-0 -top-2 -bottom-2 w-full opacity-0 cursor-pointer touch-none disabled:hidden"
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-[0_0_10px_rgba(139,92,246,0.8)] pointer-events-none sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
            style={{ left: `clamp(0px, calc(${progressPercent}% - 6px), calc(100% - 12px))` }}
          />
        </div>

        <div className="relative bg-surface-1/[0.98] sm:bg-surface-1/90 sm:backdrop-blur-xl sm:backdrop-saturate-[1.8] shadow-rim border-t border-white/10 flex flex-wrap items-center">

          {/* Video — VISIBLE para que YouTube permita el audio. Se puede ampliar o poner a pantalla completa. */}
          <div
            ref={videoWrapRef}
            data-cpn-video={!useAudio && currentVideo && !isLive ? (isPlaying ? 'playing' : 'paused') : undefined}
            className={`bg-obsidian overflow-hidden ${
              isExpanded
                ? 'relative w-full aspect-video max-h-[50vh] sm:max-h-[60vh]'
                : floating
                  ? 'absolute right-2 bottom-[calc(100%+14px)] z-10 w-[62vw] max-w-[360px] aspect-video rounded-xl border border-white/15 shadow-[0_12px_40px_rgba(0,0,0,0.6)]'
                  : 'relative shrink-0 w-[112px] h-[63px] sm:w-[142px] sm:h-[80px] self-start sm:self-stretch'
            }`}
          >
            {/* Ventana de video: agrandar, compartir y bajarla a la barra (sigue sonando) */}
            {floating && (
              <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-end gap-1 p-1.5 bg-gradient-to-b from-black/70 to-transparent">
                <button onClick={handleFullscreen} className="w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center" aria-label="Pantalla completa" title="Pantalla completa">
                  <Maximize className="w-4 h-4" />
                </button>
                <button onClick={shareCurrent} className="w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center" aria-label="Compartir video" title="Compartir">
                  <Share2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setVideoHidden(true)}
                  className="w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center"
                  aria-label="Achicar video (sigue sonando)"
                  title="Achicar (sigue sonando)"
                >
                  <ChevronsDownUp className="w-4 h-4" />
                </button>
              </div>
            )}
            {shareNotice && floating && (
              <span className="absolute bottom-2 left-2 z-10 px-2 py-1 rounded-md bg-black/70 text-white text-xs">Enlace copiado</span>
            )}
            {useAudio ? (
              <>
                {isLive ? (
                  <LiveArtwork src={currentVideo.thumbnail} alt="" sizes="142px" imageClassName="object-contain p-2 bg-surface-2" />
                ) : (
                  currentVideo.thumbnail && <Image src={currentVideo.thumbnail} alt="" fill sizes="142px" className="object-cover" />
                )}
                <div
                  className="absolute inset-0 bg-black/30 flex items-center justify-center cursor-pointer"
                  onClick={openFull}
                >
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
              <>
                <ReactPlayer {...playerProps} />
                {/* Música: si solo se pudo con YouTube, igual se muestra la portada (no el video) */}
                {!currentVideo.isVideo && (
                  <div className="absolute inset-0 cursor-pointer" onClick={openFull}>
                    {currentVideo.thumbnail && <Image src={currentVideo.thumbnail} alt="" fill sizes="142px" className="object-cover" />}
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                      <Headphones className="w-5 h-5 text-white/90 drop-shadow" />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Info + reproducción */}
          <div className="flex-1 flex items-center px-3 sm:px-5 py-1.5 sm:py-2 gap-2 sm:gap-5 min-w-0">
            <button
              type="button"
              onClick={openFull}
              className="min-w-0 flex-1 sm:max-w-xs text-left"
              aria-label="Abrir reproductor"
            >
              <p className="text-white text-xs sm:text-sm font-medium leading-tight line-clamp-2 sm:truncate">
                {currentVideo.title}
              </p>
              <p className="text-slate-500 text-xs truncate mt-0.5">
                {isLive && reconnecting ? (
                  <span className="text-amber-400">Señal interrumpida · reconectando…</span>
                ) : audioMode && !useAudio ? (
                  <span className="text-amber-400/90">Sin audio de fondo · suena solo con la app abierta</span>
                ) : (
                  currentVideo.channelTitle
                )}
              </p>
            </button>

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
                  className="w-10 h-10 sm:w-9 sm:h-9 bg-violet-500 hover:bg-violet-400 rounded-full flex items-center justify-center transition-all hover:scale-105 shadow-glow"
                  title={isPlaying ? 'Pausar' : 'Reproducir'}
                  aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4 text-white fill-white" />
                  ) : (
                    <Play className="w-4 h-4 text-white fill-white ml-0.5" />
                  )}
                </button>

                <button
                  onClick={() => {
                    const st = useMusicStore.getState()
                    // Última canción y la radio aún busca: avanzar en cuanto lleguen
                    if (st.currentIndex >= st.queue.length - 1 && isRadioLoadingRef.current) waitingForRadioRef.current = true
                    else playNext()
                  }}
                  disabled={isLastInQueue}
                  className="p-2 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Siguiente"
                  aria-label="Siguiente"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              </div>

              {isLive ? (
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> En vivo
                </span>
              ) : (
                <div className="hidden sm:flex items-center gap-1 text-xs text-slate-600 font-mono">
                  <span>{formatTime(localPlayed * localDuration)}</span>
                  <span>·</span>
                  <span>{formatTime(localDuration)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Acciones — en móvil ocupan una segunda fila completa */}
          <div className="w-full sm:w-auto flex items-center justify-between sm:justify-end gap-1 sm:gap-2 px-2 sm:px-5 pb-1 sm:pb-0 shrink-0 border-t border-white/5 sm:border-0">
            <span className="sm:hidden max-[359px]:hidden pl-1 text-[11px] text-slate-500 font-mono tabular-nums whitespace-nowrap">
              {isLive ? (
                <span className="inline-flex items-center gap-1 font-sans font-bold text-emerald-400 uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> En vivo
                </span>
              ) : (
                <>{formatTime(localPlayed * localDuration)} / {formatTime(localDuration)}</>
              )}
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
                    className="w-20 accent-violet-500 cursor-pointer"
                  />
                </div>
              </div>

              <button
                onClick={() => currentVideo && (isLive ? toggleFavoriteRadio(currentVideo) : toggleSaved(currentVideo))}
                className={`${iconBtn} ${
                  isCurrentSaved ? 'text-purple-500 hover:text-purple-400' : 'text-slate-500 hover:text-white'
                }`}
                title={isCurrentSaved ? 'Quitar de guardadas' : 'Guardar'}
                aria-label={isCurrentSaved ? 'Quitar de guardadas' : 'Guardar'}
                aria-pressed={isCurrentSaved}
              >
                <Heart className={`w-4 h-4 ${isCurrentSaved ? 'fill-purple-500' : ''}`} />
              </button>

              <button
                onClick={() => {
                  toggleHighQuality()
                }}
                className={`${iconBtn} ${isLive ? 'hidden' : ''} ${audioBoost ? 'text-violet-400' : 'text-slate-500 hover:text-white'}`}
                title={
                  audioBoost
                    ? `Audio en alta calidad${currentBitrate ? ` (${currentBitrate} kbps)` : ''}`
                    : 'Activar audio en alta calidad'
                }
                aria-label="Audio en alta calidad"
                aria-pressed={audioBoost}
              >
                <Sparkles className="w-4 h-4" />
              </button>

              {/* Ver el video de la canción: se abre aparte (pausa la música), como en la sección Videos */}
              {canWatchVideo && (
                <button
                  onClick={openVideo}
                  className={`${iconBtn} text-slate-500 hover:text-white`}
                  title="Ver el video"
                  aria-label="Ver el video"
                >
                  <TvMinimalPlay className="w-4 h-4" />
                </button>
              )}

              <button
                onClick={toggleQueue}
                className={`${iconBtn} ${isQueueOpen ? 'text-violet-400' : 'text-slate-500 hover:text-white'}`}
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

/** ¿Es un video o una película (no una canción)? Por el título o por durar más de una hora sin ser un mix. */
function looksLikeVideo(v: { title: string; duration?: string; channelTitle?: string; isVideo?: boolean }): boolean {
  if (v.isVideo) return true
  const text = `${v.title} ${v.channelTitle ?? ''}`.toLowerCase()
  if (/pel[ií]cula|movie|film completo|cap[ií]tulo|episodio|temporada|documental|trailer|tr[aá]iler|serie completa|noticiero|en vivo tv/.test(text)) return true
  const secs = durationSeconds(v.duration)
  const musicMix = /mix|playlist|enganchados|grandes [eé]xitos|[aá]lbum|album|full album|concierto|live|en vivo|lo mejor|cumbias|baladas|music|m[uú]sica|songs|canciones|hits/.test(text)
  return secs >= 60 * 60 && !musicMix
}

function durationSeconds(d?: string): number {
  if (!d) return 0
  const iso = d.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
  if (iso) return Number(iso[1] || 0) * 3600 + Number(iso[2] || 0) * 60 + Number(iso[3] || 0)
  return d.split(':').reduce((acc, part) => acc * 60 + (Number(part) || 0), 0)
}

/** Otra subida de la misma canción (duración parecida) que no se haya probado. */
async function findAlternativeId(track: MusicVideo, tried: Set<string>): Promise<string | null> {
  try {
    const q = `${track.title.replace(/\(.*?\)|\[.*?\]/g, '').trim()} ${track.title.includes(track.channelTitle) ? '' : track.channelTitle}`.trim()
    const res = await fetch(`/api/youtube/music?q=${encodeURIComponent(q)}`)
    const data = (await res.json()) as { videos?: MusicVideo[] }
    const want = durationSeconds(track.duration)
    const options = (data.videos ?? []).filter((v) => !tried.has(v.id))
    // Solo la misma canción del mismo artista: si no aparece, mejor saltarla que poner otra
    const meta = parseTrackMeta(track)
    const artist = track.pending?.artist || meta.artist || track.channelTitle
    const song = track.pending?.title || track.title.replace(/^[^-–]+[-–]\s*/, '') || track.title
    const best = bestTrack(
      options.map((v) => ({ id: v.id, title: v.title, channel: v.channelTitle, seconds: durationSeconds(v.duration) })),
      artist,
      song,
      want
    )
    return best?.id ?? null
  } catch {
    return null
  }
}

// Audífonos desconectados: el navegador pausa la música y no hay que reanudarla por el parlante.
let lastDeviceChange = 0
let onUnplug: (() => void) | null = null
if (typeof navigator !== 'undefined' && navigator.mediaDevices?.addEventListener) {
  try {
    navigator.mediaDevices.addEventListener('devicechange', () => {
      lastDeviceChange = Date.now()
      onUnplug?.()
    })
  } catch {}
}
function unpluggedRecently() {
  return Date.now() - lastDeviceChange < 3000
}

// Búsquedas de canciones pendientes en curso (para no repetirlas)
const pendingResolutions = new Map<string, Promise<string | null>>()
function resolvePendingId(track: MusicVideo): Promise<string | null> {
  const p = track.pending
  if (!p) return Promise.resolve(null)
  let job = pendingResolutions.get(track.id)
  if (!job) {
    const params = new URLSearchParams({ artist: p.artist, title: p.title, d: String(p.duration || 0) })
    job = fetch(`/api/catalog/resolve?${params}`)
      .then((r) => (r.ok ? r.json() : { id: null }))
      .then((d: { id?: string | null }) => d.id ?? null)
      .catch(() => null)
      .then((id) => {
        if (!id) pendingResolutions.delete(track.id)
        return id
      })
    pendingResolutions.set(track.id, job)
  }
  return job
}

const normSong = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
