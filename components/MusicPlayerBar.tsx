'use client'

import { useShallow } from 'zustand/react/shallow'
import dynamic from 'next/dynamic'
import { useRef, useCallback, useEffect, useState, useMemo } from 'react'
import Image from 'next/image'
import LiveArtwork from '@/components/LiveArtwork'
import { usePathname, useRouter } from 'next/navigation'
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
import { nativeAudioUrl, reportMediaState, isNativeApp, nativePrefetch, nativeFileUrl, hasNativeEq, applyNativeEq, getNative } from '@/lib/native'
import NowPlayingSheet from '@/components/NowPlayingSheet'
import { trackShareUrl } from '@/lib/share'
import { useOfflineStore } from '@/store/offlineStore'
import { getFile } from '@/lib/offline-files'
import { phoneAudioUrl } from '@/lib/phone-storage'
import { useEqStore } from '@/store/eqStore'
import { fetchRadioTracks } from '@/lib/archive-radio-client'
import { useSwipeDown } from '@/lib/use-swipe-down'
import { isArchiveFile } from '@/lib/audio-quality'
import { useAlwaysVideo, getAlwaysVideo, setAlwaysVideo } from '@/lib/always-video'
import SheetHandle from '@/components/SheetHandle'
import { songArtist, mainArtistName, genreOfArtist, classifyArtists } from '@/lib/library-radio'
import { precacheUpcoming, precachedUrl, precacheEnabled } from '@/lib/audio-precache'
import { attachEqualizer, updateEqualizer, resumeEqualizer, resetEqualizer, equalizerStalled, eqSafeUrl } from '@/lib/equalizer'
// react-player v3 — ref is HTMLVideoElement, props use native HTML video API
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { appHidden, PIP_EVENT, ytIdOf } from '@/lib/pip'
import { cachedYtAudio, cacheYtAudio, isDesktop } from '@/lib/yt-audio-cache'
import { nativeCast, nativeCastAvailable, nativeCastStop, nativeCastControl, castKind } from '@/lib/native-cast'
import { useCastStore } from '@/components/CastButton'
import InlineVideo from '@/components/InlineVideo'
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
  // Dos reintentos (el teléfono puede fallar un momento, p. ej. mientras descarga otras canciones);
  // el servidor local ignora lo que va después de "?"
  // Al instante (sin esperar nada más: al bloquear el teléfono el cambio a audio no se demora). Si
  // el teléfono no logra sacar el audio, después se prueban las fuentes públicas (plan B, ver
  // handleAudioError)
  if (native) return Promise.resolve([native, `${native}?r=1`].map((url) => ({ url, mimeType: 'audio/mp4', bitrate: 160000, source: 'device' as const })))
  return loadWebCandidates(id)
}

function loadWebCandidates(id: string): Promise<AudioCandidate[]> {
  let p = audioCache.get(id)
  if (!p) {
    // Copia guardada en el dispositivo (audio de un video ya visto): primero, al instante
    const saved = cachedYtAudio(id).catch(() => null)
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
      .then(async (c) => {
        const mine = await saved
        if (mine) c = [{ url: mine, mimeType: 'audio/mp4', bitrate: 130000, source: 'app' as const }, ...c]
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
// Archivos (archive.org, MP3, música del teléfono): una sola fuente, con datos lentos tarda más
const FILE_START_MS = 40000
const FILE_STALL_MS = 45000
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

  // Canción de YouTube cuyo audio ya se descargó (convertido): suena desde esa copia, como audio
  // (sigue con la pantalla apagada y sin internet) en vez del video de YouTube
  const queuedVideo = queue[currentIndex]
  const convertedKey =
    queuedVideo && !queuedVideo.audioUrl && !queuedVideo.streamUrl && /^[A-Za-z0-9_-]{11}$/.test(queuedVideo.id) ? `/api/stream?id=${queuedVideo.id}` : ''
  const convertedNow = useOfflineStore((s) => !!(convertedKey && s.items[convertedKey]))
  // Se decide al empezar la canción (si termina de descargarse mientras suena, no se cambia la
  // fuente: empezaría de nuevo)
  const convStartRef = useRef<{ id: string; conv: boolean }>({ id: '', conv: false })
  if (queuedVideo && convStartRef.current.id !== queuedVideo.id) convStartRef.current = { id: queuedVideo.id, conv: convertedNow }
  const hasConverted = convertedNow && convStartRef.current.conv
  const currentVideo = useMemo(
    () => (queuedVideo && hasConverted ? { ...queuedVideo, audioUrl: convertedKey } : queuedVideo),
    [queuedVideo, hasConverted, convertedKey]
  )

  // ===== Radio: al empezar la última canción de la cola, se añade música parecida =====
  const [isRadioLoading, setIsRadioLoading] = useState(false)
  const [radioRetry, setRadioRetry] = useState(0)
  const isRadioLoadingRef = useRef(false)
  isRadioLoadingRef.current = isRadioLoading
  const radioSeedRef = useRef<string | null>(null)
  // La canción terminó mientras la radio aún buscaba: seguir en cuanto lleguen canciones
  const waitingForRadioRef = useRef(false)
  const isLastTrack = queue.length > 0 && currentIndex === queue.length - 1

  useEffect(() => {
    if (!radioEnabled || !isLastTrack || !currentVideo || currentVideo.streamUrl || radioSeedRef.current === currentVideo.id) return
    // La radio de archive.org por género ya se rellena sola (más abajo)
    if (currentVideo.archiveRadio) return
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
    const isFile = !!currentVideo.audioUrl
    const artistName = isFile ? songArtist(currentVideo) : mainArtistName(currentArtist || '')
    const artistParams = currentVideo.artistId ? `id=${currentVideo.artistId}` : artistName ? `name=${encodeURIComponent(artistName)}` : ''
    const fresh = (d: { tracks?: MusicVideo[] }) => (d.tracks ?? []).filter((t) => !inQueue.has(songKey(t)))
    // Al terminar el disco, la playlist o lo que sonaba: canciones de artistas parecidos (y unas
    // pocas del mismo). Si no se encuentran: discos de archive.org del mismo género (para archivos
    // y enlaces) o más del mismo artista / música parecida de YouTube.
    const similar: Promise<MusicVideo[]> = artistParams
      ? fetch(`/api/catalog/similar?${artistParams}`)
          .then((r) => (r.ok ? r.json() : { tracks: [] }))
          .then(fresh)
          .catch(() => [])
      : Promise.resolve([])

    similar
      .then(async (sim) => {
        if (sim.length >= 5) return { videos: sim.slice(0, 24) }
        if (isFile && artistName) {
          if (!genreOfArtist(artistName)) await classifyArtists([artistName], 1).catch(() => {})
          const genre = genreOfArtist(artistName)
          if (genre) {
            const tracks = await fetchRadioTracks(genre, useMusicStore.getState().queue).catch(() => [])
            if (tracks.length) return { videos: tracks, keep: true }
          }
        }
        const own = artistParams
          ? await fetch(`/api/catalog/artist-tracks?${artistParams}`)
              .then((r) => (r.ok ? r.json() : { tracks: [] }))
              .then(fresh)
              .catch(() => [])
          : []
        if (own.length >= 3) return { videos: own.slice(0, 20) }
        const r = await fetch(`/api/youtube/for-you?${params.toString()}`)
        return r.ok ? ((await r.json()) as { videos?: MusicVideo[] }) : null
      })
      .then((data: { videos?: MusicVideo[]; keep?: boolean } | null) => {
        const list = data?.videos ?? []
        // Radio de archive.org: se añade tal cual (sigue sola, sin fin)
        if (data?.keep) {
          const added = appendToQueue(list)
          if (added > 0 && waitingForRadioRef.current) useMusicStore.getState().playNext()
          return
        }
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

  // ===== Radio de Internet Archive por género: nunca se detiene =====
  // Cuando quedan pocas canciones se piden más del mismo género (otros discos, sin repetir)
  const archiveRadioGenre = currentVideo?.archiveRadio
  const archiveRadioLoadingRef = useRef(false)
  const archiveRadioFailsRef = useRef(0)
  useEffect(() => {
    if (!archiveRadioGenre || archiveRadioLoadingRef.current) return
    if (queue.length - 1 - currentIndex > 3) return
    archiveRadioLoadingRef.current = true
    setIsRadioLoading(true)
    useMusicStore.getState().trimPlayed(40)
    fetchRadioTracks(archiveRadioGenre, useMusicStore.getState().queue)
      .then((tracks) => {
        const added = appendToQueue(tracks)
        archiveRadioFailsRef.current = added > 0 ? 0 : archiveRadioFailsRef.current + 1
        if (added > 0 && waitingForRadioRef.current) useMusicStore.getState().playNext()
      })
      .catch(() => {
        archiveRadioFailsRef.current++
      })
      .finally(() => {
        waitingForRadioRef.current = false
        setIsRadioLoading(false)
        // Si archive.org no respondió, se reintenta en un rato (sin quedar en silencio para siempre)
        const wait = archiveRadioFailsRef.current ? Math.min(60000, 5000 * archiveRadioFailsRef.current) : 0
        setTimeout(() => {
          archiveRadioLoadingRef.current = false
          if (wait) setRadioRetry((n) => n + 1)
        }, wait)
      })
  }, [archiveRadioGenre, currentIndex, queue.length, appendToQueue, radioRetry])

  // ===== Modo audio (segundo plano real) =====
  const [audioSrc, setAudioSrc] = useState<{ id: string; candidates: AudioCandidate[]; index: number } | null>(null)
  const [audioFailedIds, setAudioFailedIds] = useState<Set<string>>(() => new Set())
  const audioFailedRef = useRef(audioFailedIds)
  audioFailedRef.current = audioFailedIds
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
  // Fuentes de un archivo, en orden: directo, por la app de Android (respaldo) y por el
  // servidor de la app (si el sitio lo bloquea o tarda)
  // Descargada para escuchar sin conexión: se usa la copia del teléfono (primera fuente)
  const offlineKey = currentVideo?.audioUrl
  // Canción que ya está sonando desde internet: si se descarga mientras suena, sigue con la misma
  // fuente hasta terminar (cambiar a la copia descargada la hacía empezar de nuevo). La copia se
  // usa la próxima vez que suene.
  const streamingIdRef = useRef<string | null>(null)
  const keepStreaming = !!currentId && streamingIdRef.current === currentId
  const isDownloaded = useOfflineStore((s) => !!(offlineKey && s.items[offlineKey])) && !keepStreaming
  const [offlineUrl, setOfflineUrl] = useState<{ key: string; url: string } | null>(null)
  useEffect(() => {
    if (!isDownloaded || !offlineKey) return
    // Guardada como música del teléfono (Música/PulsoMedia): suena desde ese archivo
    const phoneId = useOfflineStore.getState().items[offlineKey]?.phoneId
    if (phoneId) {
      setOfflineUrl({ key: offlineKey, url: phoneAudioUrl(phoneId) })
      return
    }
    let url = ''
    let cancelled = false
    getFile(offlineKey)
      .then((blob) => {
        if (cancelled) return
        if (!blob) return useOfflineStore.getState().removeKeys([offlineKey])
        url = URL.createObjectURL(blob)
        setOfflineUrl({ key: offlineKey, url })
      })
      .catch(() => {})
    return () => {
      cancelled = true
      // Se libera un poco después (por si el reproductor aún lo está cerrando)
      if (url) setTimeout(() => URL.revokeObjectURL(url), 5000)
    }
  }, [isDownloaded, offlineKey])
  const offlineReady = !!offlineKey && offlineUrl?.key === offlineKey
  // Mientras se abre la copia descargada no se empieza a bajar de internet
  const waitingOffline = isDownloaded && !offlineReady

  // Descargada antes de que le tocara sonar (lib/audio-precache): se elige al empezar la canción y
  // no se cambia mientras suena (cambiar de fuente la haría empezar de nuevo)
  const preRef = useRef<{ id: string; url: string | null }>({ id: '', url: null })
  if (currentId && preRef.current.id !== currentId) preRef.current = { id: currentId, url: precachedUrl(currentVideo?.audioUrl) }
  const preUrl = preRef.current.url
  const hqArchive = useMusicStore((s) => s.audioBoost)
  const remoteCandidates = useMemo(() => {
    const direct = currentVideo?.audioUrl
    if (!direct) return [] as string[]
    const list: string[] = []
    if (offlineUrl && offlineUrl.key === direct) list.push(offlineUrl.url)
    else if (preUrl) list.push(preUrl)
    // Convertida de YouTube (/api/stream?id=…): en la app de Android, desde el propio teléfono
    const ytConv = direct.match(/^\/api\/stream\?id=([A-Za-z0-9_-]{11})/)
    const ytLocal = ytConv ? nativeAudioUrl(ytConv[1]) : null
    if (ytLocal) list.push(ytLocal)
    // Alta calidad: el original de archive.org (FLAC / MP3 320) antes que la copia liviana
    if (hqArchive && isArchiveFile(direct)) list.push(`/api/archive-best?stream=1&u=${encodeURIComponent(direct)}`)
    // Directo primero (comprobado en todos los navegadores, con ecualizador incluido); por el
    // teléfono queda de respaldo (en algunos Android ese camino no suena y saltaba las canciones)
    list.push(direct)
    const viaPhone = nativeFileUrl(direct)
    if (viaPhone) list.push(viaPhone)
    if (/^https?:\/\//.test(direct)) list.push(`/api/link-audio?u=${encodeURIComponent(direct)}`)
    return list
  }, [currentVideo?.audioUrl, offlineUrl, preUrl, hqArchive])
  const [remoteAttempt, setRemoteAttempt] = useState<{ id: string; n: number } | null>(null)
  const remoteIndex = remoteAttempt && currentId && remoteAttempt.id === currentId ? remoteAttempt.n : 0
  const remoteFileUrl = remoteCandidates[remoteIndex] ?? currentVideo?.audioUrl
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
  // «Ver siempre el video» (Configuración): las canciones de YouTube se ven como video; al bloquear
  // o salir de la app pasan al audio y al volver, otra vez al video (desde donde iba)
  const alwaysVideo = useAlwaysVideo()
  // («Canción» elegida en el reproductor —o el audio que toma el relevo al bloquear— se respeta
  // siempre, también en los videos que venían de la sección Videos)
  const asVideo =
    !!currentVideo &&
    !(currentVideo as { forceAudio?: boolean }).forceAudio &&
    (!!currentVideo.isVideo ||
      (alwaysVideo &&
      /^[A-Za-z0-9_-]{11}$/.test(currentVideo.id) &&
      !currentVideo.audioUrl &&
      !currentVideo.streamUrl &&
      !currentVideo.pending))
  const wantAudio = !!currentId && !asVideo && !audioFailedIds.has(currentId) && !audioSourcesDown()
  // Viéndose como video: el teléfono deja listo su audio (al bloquear, el cambio es al instante)
  useEffect(() => {
    if (asVideo && currentId && /^[A-Za-z0-9_-]{11}$/.test(currentId)) nativePrefetch(currentId)
  }, [asVideo, currentId])
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
  // ===== Video dentro del reproductor grande (en el lugar de la carátula) =====
  // place: dentro del reproductor grande o en ventana flotante sobre la app
  const [inline, setInline] = useState<{ id: string; start: number; place?: 'sheet' | 'float'; key?: number } | null>(null)
  const inlineRef = useRef(inline)
  inlineRef.current = inline
  const inlineTimeRef = useRef(0)
  // El video del reproductor está sonando: la canción espera en pausa (sin darla por caída) y el
  // play/pausa del reproductor manda al video
  const videoOwnsRef = useRef(false)
  const inlineCtlRef = useRef<((func: 'playVideo' | 'pauseVideo') => void) | null>(null)
  // El video agrandado viene del reproductor: al cerrarlo vuelve ahí (al video); «Canción», a la canción
  const expandedFromInlineRef = useRef(false)
  const showInline = useCallback(() => {
    const st = useMusicStore.getState()
    const id = ytIdOf(st.queue[st.currentIndex])
    if (!id) return
    const el = playerRef.current as unknown as HTMLMediaElement | null
    setInline({ id, start: el && isFinite(el.currentTime) ? el.currentTime : 0 })
  }, [])
  /** Del video a la canción, desde el mismo segundo (sin salir del reproductor) */
  const backToSong = useCallback((t?: number) => {
    const at = typeof t === 'number' ? t : inlineTimeRef.current
    const wasPlaying = useMusicStore.getState().isPlaying
    videoOwnsRef.current = false
    const el = playerRef.current as unknown as HTMLMediaElement | null
    if (el && at > 0 && isFinite(el.duration) && el.duration > 0) el.currentTime = Math.min(at + 0.1, el.duration - 1)
    if (!el || !wasPlaying || !inlineRef.current) {
      setInline(null)
      return
    }
    // App en segundo plano (bloqueo, otra app): la canción suena YA, con sonido. (Android pausa
    // solo cualquier audio en silencio con la app oculta: el empalme en silencio la dejaba muda)
    if (document.visibilityState === 'hidden') {
      el.muted = false
      setInline(null)
      el.play()?.catch?.(() => {})
      useMusicStore.getState().setIsPlaying(true)
      return
    }
    // Sin silencio en medio: el video sigue sonando hasta que la canción de verdad suena (empieza
    // en silencio en el mismo segundo y en ese instante se quita el video)
    el.muted = true
    let done = false
    const finish = () => {
      if (done) return
      done = true
      el.removeEventListener('playing', finish)
      el.muted = false
      setInline(null)
    }
    el.addEventListener('playing', finish)
    setTimeout(finish, 2500)
    el.play()?.catch?.(() => finish())
    useMusicStore.getState().setIsPlaying(true)
  }, [])

  /**
   * Mover el video entre el reproductor y la ventana flotante sin que se note: la canción sigue
   * sonando desde el segundo del video mientras el video se vuelve a cargar en su nuevo lugar
   * (empieza en silencio, se pone parejo y retoma el sonido)
   */
  const moveInline = useCallback((place: 'sheet' | 'float') => {
    const cur = inlineRef.current
    if (!cur) return
    const at = inlineTimeRef.current
    const el = playerRef.current as unknown as HTMLMediaElement | null
    if (videoOwnsRef.current && el) {
      videoOwnsRef.current = false
      if (at > 0 && isFinite(el.duration) && el.duration > 0) el.currentTime = Math.min(at, el.duration - 1)
      el.muted = false
      if (useMusicStore.getState().isPlaying) el.play()?.catch?.(() => {})
    }
    setInline({ id: cur.id, start: at, place, key: Date.now() })
  }, [])

  // Ver el video desde donde va la canción (y al cerrarlo, la canción sigue desde donde quedó el video)
  const openVideo = useCallback(() => {
    const st = useMusicStore.getState()
    const v = st.queue[st.currentIndex]
    if (!v) return
    const el = playerRef.current as unknown as HTMLMediaElement | null
    const startTime = el && isFinite(el.currentTime) ? el.currentTime : 0
    const id = ytIdOf(v)
    if (!id) return
    setVideoModal({ id, title: v.title, channelTitle: v.channelTitle, startTime })
  }, [])
  // La ventana de video sigue a la canción que suena: si tiene video, se muestra el suyo (desde
  // donde va el audio); si no, se cierra y sigue la canción
  const followVideo = useCallback((at?: number) => {
    const st = useMusicStore.getState()
    const v = st.queue[st.currentIndex]
    const id = ytIdOf(v)
    if (!v || !id) return setVideoModal(null)
    const el = playerRef.current as unknown as HTMLMediaElement | null
    const startTime = typeof at === 'number' ? at : el && isFinite(el.currentTime) ? el.currentTime + 0.8 : 0
    setVideoModal({ id, title: v.title, channelTitle: v.channelTitle, startTime })
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
      ? waitingOffline
        ? undefined
        : remoteFileUrl
      : isLocal
      ? localUrl?.id === currentId
        ? localUrl.url
        : undefined
      : useAudio && audioSrc?.id === currentId
      ? audioSrc.candidates[audioSrc.index]?.url
      : undefined
  const isAudioLoading = useAudio && !audioUrl
  // ¿Suena desde otra fuente que no sea la copia descargada (internet o la pre-descarga)? Se recuerda
  // para no cambiarle la fuente si se descarga mientras suena (empezaba de nuevo)
  if (currentId && audioUrl && audioUrl !== offlineUrl?.url) streamingIdRef.current = currentId
  else if (currentId && streamingIdRef.current && streamingIdRef.current !== currentId) streamingIdRef.current = null

  // ===== Ecualizador =====
  // Solo con fuentes que lo permiten (la app de Android, archivos, discos y MP3 de enlaces, o por
  // el servidor de la app). Radios y YouTube en la web quedan sin ecualizador: si no, el navegador
  // las dejaría en silencio. Al cambiar entre una y otra se usa un <audio> distinto (key).
  const eqEnabled = useEqStore((s) => s.enabled)
  const eqGains = useEqStore((s) => s.gains)
  const eqLeveler = useEqStore((s) => s.leveler)
  const [eqNativeBlocked, setEqNativeBlocked] = useState(false)
  const isNativeSrc = !!audioUrl?.startsWith('http://127.0.0.1')
  // (Los MP3 de otros sitios, como archive.org, no: si no dan permiso CORS el audio fallaba y se
  // saltaban las canciones. Pasan por el ecualizador solo si vienen por el servidor de la app.)
  const eqSafe = useAudio && !isLive && !!audioUrl && (isLocalFile || (isNativeSrc ? !eqNativeBlocked : eqSafeUrl(audioUrl)))
  // En "Normal" (todas las bandas en 0 y sin nivelador) no hay nada que procesar: el audio va
  // directo, sin pasar por el sistema de audio (cero riesgo de chasquidos)
  const eqDoesSomething = eqLeveler || eqGains.some((g) => Math.abs(g) > 0.05)
  // App de Android: el ecualizador lo hace el teléfono (Web Audio en Android chisporrotea), así que
  // la música nunca pasa por el sistema de audio de la web
  // (o la app misma, si en ese teléfono el del sistema no se nota: Configuración del ecualizador)
  const eqEngine = useEqStore((s) => s.engine)
  const [phoneEqAvailable] = useState(() => typeof window !== 'undefined' && hasNativeEq())
  const nativeEq = phoneEqAvailable && eqEngine === 'phone'
  // Al pasar al ecualizador de la app, el del teléfono se apaga
  useEffect(() => {
    if (phoneEqAvailable && eqEngine === 'app') applyNativeEq({ on: false, gains: [0, 0, 0, 0, 0], leveler: false })
  }, [phoneEqAvailable, eqEngine])
  const eqActive = !nativeEq && eqEnabled && eqSafe && eqDoesSomething
  // Al cambiar la salida de sonido (audífonos ↔ parlante Bluetooth) se arma un <audio> nuevo
  const [eqEpoch, setEqEpoch] = useState(0)
  useEffect(() => {
    if (!nativeEq) useEqStore.getState().setApplies(eqSafe)
  }, [eqSafe, nativeEq])
  // Ecualizador del teléfono: activo solo mientras suena la música de la app
  // (Al pausar se apaga recién a los 30 s y al mover las barras se aplica cuando se detienen: cada
  // encendido o cambio del procesador de audio se oía como un chasquido)
  useEffect(() => {
    if (!nativeEq) return
    const want = eqEnabled && eqDoesSomething
    const t = setTimeout(
      () => {
        const on = want && isPlaying
        const r = applyNativeEq({ on, gains: eqGains, leveler: eqLeveler })
        if (on || !eqEnabled) {
          useEqStore.getState().setNative(r)
          useEqStore.getState().setApplies(r === 'ok')
        }
      },
      want && !isPlaying ? 30000 : 180
    )
    return () => clearTimeout(t)
  }, [nativeEq, eqEnabled, eqDoesSomething, isPlaying, eqGains, eqLeveler])

  // Canción que no se puede reproducir: se salta para que la música siga fluida
  const [skipNotice, setSkipNotice] = useState<string | null>(null)
  const skipUnplayable = useCallback((id: string) => {
    const st = useMusicStore.getState()
    const cur = st.queue[st.currentIndex]
    if (!cur || cur.id !== id) return
    pendingSeekRef.current = -1
    setSkipNotice(cur.title)
    if (st.currentIndex < st.queue.length - 1) st.playNext()
    else if (st.radioEnabled || cur.archiveRadio) waitingForRadioRef.current = true
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
    // (En la app el audio del video se deja listo al instante: al salir o bloquear suena sin esperar)
    const delay = wantAudio || document.visibilityState === 'hidden' || isNativeApp() ? 0 : 1500
    const timer = setTimeout(() =>
    loadAudioCandidates(currentId).then((candidates) => {
      if (cancelled) return
      if (candidates.length === 0) {
        if (wantAudio) markAudioFailed(currentId)
        return
      }
      setAudioSrc({ id: currentId, candidates: orderCandidates(candidates, useMusicStore.getState().audioBoost), index: 0 })
      // Web, viéndose como video: su audio se guarda en el dispositivo; al minimizar o bloquear
      // sigue desde esa copia al instante (como en la app de Android)
      if (!wantAudio && !isNativeApp()) {
        const id = currentId
        cacheYtAudio(id).then((url) => {
          if (!url || cancelled) return
          setAudioSrc((prev) => (prev && prev.id === id && !useAudioRef.current && !prev.candidates.some((c) => c.url === url) ? { ...prev, candidates: [{ url, mimeType: 'audio/mp4', bitrate: 130000, source: 'app' }, ...prev.candidates], index: 0 } : prev))
        })
      }
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
    // ¿Sonaba justo al salir de la app? (anotado al instante, antes de que YouTube se pause solo)
    let playingAtHide = false
    const switchIfNeeded = (e?: Event) => {
      const st = useMusicStore.getState()
      if (e?.type === 'visibilitychange') playingAtHide = document.visibilityState === 'hidden' && (st.isPlaying || playingAtHide)
      // Computador: el video sigue sonando solo al minimizar o cambiar de pestaña (no se corta)
      if (!isNativeApp() && isDesktop() && !bgActiveRef.current) return
      if (appHidden()) {
        // Sonaba al bloquear (YouTube ya pudo haberse pausado solo): se sigue con el audio propio
        if (!(st.isPlaying || hiddenWantRef.current || playingAtHide) || useAudioRef.current) return
        // Sonaba por el video porque su audio había fallado: al salir de la app el video se
        // detiene, así que se vuelve a pedir el audio desde cero (y sigue desde donde iba)
        if (currentId && (audioFailedRef.current.has(currentId) || audioSourcesDown())) {
          audioDownUntil = 0
          audioFailStreak = 0
          audioCache.delete(currentId)
          setAudioFailedIds((prev) => {
            const next = new Set(prev)
            next.delete(currentId)
            return next
          })
          setAudioSrc(null)
          pendingSeekRef.current = localPlayedRef.current
          bgActiveRef.current = true
          setBgAudioId(currentId)
          if (!st.isPlaying) st.setIsPlaying(true)
          return
        }
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
    // Ventana flotante con el video: no se pasa al audio (se sigue viendo el video ahí)
    window.addEventListener(PIP_EVENT, switchIfNeeded)
    return () => {
      document.removeEventListener('visibilitychange', switchIfNeeded)
      window.removeEventListener(PIP_EVENT, switchIfNeeded)
    }
  }, [quickStartId, currentId, audioReady, audioSwitchId, bgAudioId])

  // Radio, discos y enlaces: las próximas canciones se descargan completas antes de su turno
  useEffect(() => {
    const cur = queue[currentIndex]
    const offline = useOfflineStore.getState().items
    const upcoming = queue
      .slice(currentIndex + 1, currentIndex + 6)
      .filter((t) => t.audioUrl && !t.streamUrl && !offline[t.audioUrl] && !isLocalTrack(t.id))
      .map((t) => t.audioUrl as string)
    precacheUpcoming(cur?.audioUrl, upcoming)
  }, [queue, currentIndex])

  // Pre-carga la siguiente canción para que el cambio sea inmediato con la pantalla bloqueada
  const nextTrack = queue[currentIndex + 1]
  const nextId =
    nextTrack && !nextTrack.streamUrl && !nextTrack.pending && !nextTrack.audioUrl && !isLocalTrack(nextTrack.id) ? nextTrack.id : undefined
  useEffect(() => {
    if (audioMode && nextId) loadAudioCandidates(nextId)
  }, [audioMode, nextId])

  // Unos segundos después de que la canción empieza a sonar se prepara la siguiente: el teléfono
  // (o el servidor) ya busca su audio y empieza a descargarlo, así el cambio de tema es inmediato
  const soundingId = useMusicStore((s) => s.soundingId)
  const nextKey = nextTrack && !nextTrack.streamUrl && !nextTrack.pending ? `${nextTrack.id}|${nextTrack.audioUrl ?? ''}` : ''
  useEffect(() => {
    if (!nextKey || !currentId || soundingId !== currentId) return
    const [id, fileUrl] = nextKey.split('|')
    let warm: HTMLAudioElement | null = null
    let cancelled = false
    const timer = setTimeout(async () => {
      let url = fileUrl
      // Ya descargada (o descargándose antes de su turno): no hay nada que preparar
      if (url && useOfflineStore.getState().items[url]) return
      if (url && precacheEnabled()) return
      // (Los archivos suenan directo: se precargan con el navegador, más abajo)
      if (!url && /^[A-Za-z0-9_-]{11}$/.test(id) && nativePrefetch(id)) return
      if (!url && /^[A-Za-z0-9_-]{11}$/.test(id)) {
        const list = await loadAudioCandidates(id).catch(() => [] as AudioCandidate[])
        url = orderCandidates(list, useMusicStore.getState().audioBoost)[0]?.url ?? ''
      }
      if (!url || cancelled) return
      warm = new Audio()
      warm.preload = 'auto'
      warm.muted = true
      warm.src = url
    }, 6000)
    return () => {
      cancelled = true
      clearTimeout(timer)
      // Se suelta un poco después: si justo ahora pasa a sonar, su descarga ya quedó guardada
      const w = warm
      if (w)
        setTimeout(() => {
          w.removeAttribute('src')
          w.load()
        }, 15000)
    }
  }, [nextKey, currentId, soundingId])

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
    // La app de Android no dejó pasar su audio de YouTube por el ecualizador: se sigue sin él
    if (eqActive && isNativeSrc && !currentVideo?.audioUrl) {
      pendingSeekRef.current = useMusicStore.getState().played
      return setEqNativeBlocked(true)
    }
    // Archivo: se prueba la fuente siguiente (por el teléfono → directo → por el servidor)
    if (currentVideo?.audioUrl && currentId && remoteIndex + 1 < remoteCandidates.length) {
      pendingSeekRef.current = useMusicStore.getState().played
      return setRemoteAttempt({ id: currentId, n: remoteIndex + 1 })
    }
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
  }, [audioSrc, currentId, markAudioFailed, isLive, isLocal, skipUnplayable, reconnectLive, remoteIndex, remoteCandidates, currentVideo?.audioUrl, eqActive, isNativeSrc])

  // Vigilante: si el audio no avanza en 15 s (fuente caída o que no carga), probar otra o saltar
  const lastProgressRef = useRef(Date.now())
  // Canción a la que ya se le dio un reinicio por no arrancar
  const kickedRef = useRef<string | null>(null)
  const handleAudioErrorRef = useRef(handleAudioError)
  handleAudioErrorRef.current = handleAudioError
  useEffect(() => {
    if (!useAudio || !isPlaying || !currentId) return
    lastProgressRef.current = Date.now()
    let lastTime = -1
    let lastBuffered = -1
    let advanced = false
    lastProgressRef.current = Date.now()
    const timer = setInterval(() => {
      // Suena el video del reproductor (la canción espera a propósito): no está caída
      if (videoOwnsRef.current) {
        lastProgressRef.current = Date.now()
        return
      }
      // Interrumpida por otra app (WhatsApp, llamada) o buscando la canción: no es una fuente caída
      if (interruptedAtRef.current || useMusicStore.getState().queue[useMusicStore.getState().currentIndex]?.pending) {
        lastProgressRef.current = Date.now()
        return
      }
      // Se mira el avance real del audio (no solo el evento timeupdate, que con la pantalla
      // apagada puede llegar tarde y hacía creer que la radio se había cortado)
      const el = playerRef.current as unknown as HTMLAudioElement | null
      if (el && !el.paused && el.currentTime !== lastTime) {
        if (lastTime >= 0) {
          lastProgressRef.current = Date.now()
          advanced = true
        }
        lastTime = el.currentTime
      }
      // Si sigue descargando (conexión lenta, p. ej. 3G), no está caída: se espera
      if (el && !isLive && el.buffered.length) {
        const end = el.buffered.end(el.buffered.length - 1)
        if (end > lastBuffered + 0.05) {
          if (lastBuffered >= 0) lastProgressRef.current = Date.now()
          lastBuffered = end
        }
      }
      // Marcada como sonando pero el audio está detenido (al reabrir la app, tras una
      // actualización…): se vuelve a arrancar
      if (el && el.paused && useMusicStore.getState().isPlaying && el.readyState >= 2) el.play()?.catch?.(() => {})
      // No arrancó en 6 s: se reinicia la canción (lo mismo que hacía falta hacer a mano: volver
      // atrás). Una vez por canción, antes de dar la fuente por caída
      // (No con el audio de un video que el teléfono todavía está buscando: reiniciarlo cortaba esa
      // búsqueda y empezaba de cero, y la canción demoraba más de un minuto)
      if (!isLive && !isNativeSrc && !advanced && Date.now() - lastProgressRef.current > 6000 && kickedRef.current !== currentId && el) {
        kickedRef.current = currentId ?? null
        lastProgressRef.current = Date.now()
        try {
          el.load()
          el.currentTime = 0
        } catch {}
        el.play()?.catch?.(() => {})
        return
      }
      // Una fuente de YouTube que no arranca en 7 s se cambia por la siguiente (hay varias). Un
      // archivo (disco de archive.org, MP3, música del teléfono) tiene una sola: se le da más tiempo
      // El audio que saca el teléfono (servidor local) puede tardar más en empezar, sobre todo
      // mientras se descargan otras canciones: se le dan 20 s antes de pasar al video
      // (los reintentos, ?r=1 y ?r=2, ya encuentran el audio buscado: 10 s)
      // (Con la app en segundo plano no se espera tanto: si no arranca en 6 s se pide de nuevo)
      const startLimit = isNativeSrc ? (audioUrl?.includes('?r=') ? 8000 : document.visibilityState === 'hidden' ? 6000 : 20000) : START_MS
      // La versión de alta calidad de archive.org que no arranca en 8 s se cambia por la de siempre
      // (antes se esperaban 40 s: parecía que los discos no cargaban)
      const hqStart = !!audioUrl?.includes('/api/archive-best') && lastTime <= 0
      const limit = isLive ? LIVE_STALL_MS : hqStart ? 8000 : isLocal ? (lastTime <= 0 ? FILE_START_MS : FILE_STALL_MS) : lastTime <= 0 ? startLimit : STALL_MS
      if (Date.now() - lastProgressRef.current < limit) return
      lastProgressRef.current = Date.now()
      if (audioUrl) handleAudioErrorRef.current()
      else markAudioFailed(currentId)
    }, 3000)
    return () => clearInterval(timer)
  }, [useAudio, isPlaying, currentId, audioUrl, markAudioFailed, isLive, isLocal, isNativeSrc])

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
  const widgetPlayRef = useRef(false)
  useEffect(() => {
    // Play del widget con la app cerrada: suena solo y la app vuelve al fondo
    if (hasHydrated && !widgetPlayRef.current) {
      widgetPlayRef.current = true
      const n = getNative()
      if (n?.takeWidgetPlay?.()) {
        resumeTriedRef.current = true
        setIsPlaying(true)
        setTimeout(() => n.toBackground?.(), 2500)
        return
      }
    }
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

  // ===== Cambio de salida de sonido (Bluetooth, audífonos, parlante del teléfono) =====
  // El ecualizador queda unido a la salida que había al empezar: al cambiarla seguía avanzando en
  // silencio. Se rearma (mismo segundo) y, sin ecualizador, se le da un "empujón" al audio.
  const eqActiveNowRef = useRef(eqActive)
  eqActiveNowRef.current = eqActive
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    // Rearmar el audio solo si de verdad dejó de sonar: un rearme sin necesidad se oye como un "click"
    const onRouteChange = (force = false) => {
      clearTimeout(timer)
      const el0 = playerRef.current as unknown as HTMLMediaElement | null
      const t0 = el0?.currentTime ?? 0
      timer = setTimeout(() => {
        const st = useMusicStore.getState()
        const el = playerRef.current as unknown as HTMLMediaElement | null
        if (!useAudioRef.current || !el) return
        if (eqActiveNowRef.current) {
          // Con ecualizador: se rearma si el sistema de audio quedó detenido o si Android avisó
          // un cambio real de salida (Bluetooth/audífonos), que deja el sonido en la salida vieja
          if (!force && !equalizerStalled()) return
          pendingSeekRef.current = st.played
          resetEqualizer()
          setEqEpoch((n) => n + 1)
        } else if (st.isPlaying && !el.paused && el.currentTime - t0 < 0.3) {
          // Sin ecualizador: solo si quedó pegado (no avanzó)
          el.pause()
          el.play().catch(() => {})
        }
      }, 1200)
    }
    const onNativeRoute = () => onRouteChange(true)
    // El navegador avisa cambios de dispositivos (también micrófonos, y al volver a la app los que
    // pasaron mientras estaba afuera): solo cuentan si cambiaron las salidas de sonido
    let outputs = ''
    const readOutputs = async () => {
      try {
        const list = await navigator.mediaDevices.enumerateDevices()
        return list
          .filter((d) => d.kind === 'audiooutput')
          .map((d) => d.deviceId + d.label)
          .sort()
          .join('|')
      } catch {
        return ''
      }
    }
    readOutputs().then((o) => (outputs = o))
    const onDeviceChange = async () => {
      const now = await readOutputs()
      if (now === outputs) return
      outputs = now
      onRouteChange()
    }
    window.addEventListener('cpn-audio-route', onNativeRoute)
    navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange)
    // Vigilante: sonando con el ecualizador detenido (otra salida, llamada). Primero se reanuda; se
    // rearma solo si sigue detenido varias veces seguidas (al salir o volver a la app Android lo
    // detiene un instante y se recupera solo: rearmarlo ahí era el "click")
    let stalledTicks = 0
    const watch = setInterval(() => {
      if (!eqActiveNowRef.current || !useMusicStore.getState().isPlaying || !equalizerStalled()) {
        stalledTicks = 0
        return
      }
      resumeEqualizer()
      if (++stalledTicks >= 3) {
        stalledTicks = 0
        onRouteChange()
      }
    }, 3000)
    return () => {
      clearTimeout(timer)
      clearInterval(watch)
      window.removeEventListener('cpn-audio-route', onNativeRoute)
      navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange)
    }
  }, [])

  // Al prender o apagar el ecualizador se cambia de <audio>: sigue en el mismo segundo
  const eqActiveRef = useRef(eqActive)
  useEffect(() => {
    if (eqActiveRef.current !== eqActive && audioUrl) pendingSeekRef.current = useMusicStore.getState().played
    eqActiveRef.current = eqActive
  }, [eqActive, audioUrl])
  useEffect(() => {
    const el = playerRef.current as unknown as HTMLMediaElement | null
    // (doble seguro: con el ecualizador del teléfono nunca se conecta el de la web)
    if (!eqActive || !el || nativeEq) return
    if (attachEqualizer(el)) updateEqualizer(el, eqGains, eqLeveler, true)
  }, [eqActive, eqGains, eqLeveler, audioUrl, eqEpoch, nativeEq])

  useEffect(() => {
    const el = playerRef.current
    if (!useAudio || !el || !audioUrl) return
    // Suena el video del reproductor: play y pausa van al video (la canción sigue en pausa)
    if (videoOwnsRef.current) {
      if (!el.paused) el.pause()
      inlineCtlRef.current?.(isPlaying ? 'playVideo' : 'pauseVideo')
      return
    }
    if (isPlaying && eqActive) resumeEqualizer()
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
  }, [useAudio, audioUrl, isPlaying, handleAutoplayBlocked, eqActive, eqEpoch])

  useEffect(() => {
    const el = playerRef.current
    if (useAudio && el) el.volume = isMuted ? 0 : volume
  }, [useAudio, audioUrl, volume, isMuted, eqActive, eqEpoch])

  // Segundo exacto y duración de lo que suena (la letra karaoke los lee varias veces por segundo)
  useEffect(() => {
    const w = window as unknown as { __cpnTime?: () => { t: number; d: number; paused: boolean } }
    w.__cpnTime = () => {
      const el = playerRef.current as unknown as HTMLMediaElement | null
      return { t: el?.currentTime ?? 0, d: el && isFinite(el.duration) ? el.duration : 0, paused: !el || el.paused }
    }
    return () => {
      delete w.__cpnTime
    }
  }, [])

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
    // ¿Sonaba justo al salir? (se anota al instante: si se esperaba la ventanita y no se abrió,
    // la decisión llega 2,5 s después y para entonces YouTube ya pudo haberse pausado solo)
    let playingAtHide = false
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && !hiddenAtRef.current && !playingAtHide) playingAtHide = isPlayingRef.current
      if (document.visibilityState === 'visible') playingAtHide = false
      if (appHidden()) {
        const wanted = isPlayingRef.current || playingAtHide
        hiddenAtRef.current = Date.now()
        keepPlayingRef.current = wanted
        hiddenWantRef.current = wanted
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
    window.addEventListener(PIP_EVENT, onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener(PIP_EVENT, onVisibility)
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
      if (videoOwnsRef.current || !interruptedAtRef.current || !useAudioRef.current || !st.isPlaying || !el?.paused) return
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
    if (i >= q.length - 1 && (isRadioLoadingRef.current || q[i]?.archiveRadio)) waitingForRadioRef.current = true
    playNext()
  }, [playNext, reconnectLive])
  const handlePlay = useCallback(() => {
    interruptedAtRef.current = 0
    setIsPlaying(true)
  }, [setIsPlaying])
  const handlePause = useCallback((e?: React.SyntheticEvent<HTMLMediaElement>) => {
    // Al terminar una canción también llega "pause": lo gestiona onEnded
    if (e?.currentTarget?.ended) return
    // La pausa la hizo la app porque suena el video del reproductor
    if (videoOwnsRef.current) return
    // Pausa causada por la reconexión de una radio: no es del usuario
    if (reconnectingRef.current) return
    if (useAudioRef.current) {
      // Si la app todavía "quiere" sonar, la pausa no la pidió el usuario (los botones y la
      // pantalla de bloqueo cambian primero el estado): la cortó otra app, p. ej. al grabar o
      // escuchar un audio de WhatsApp, una llamada o una alarma. Se reanuda sola después.
      if (useMusicStore.getState().isPlaying && !unpluggedRecently()) {
        const el = e?.currentTarget ?? (playerRef.current as unknown as HTMLMediaElement | null)
        // Justo al salir de la app o bloquear (no es otra app sonando): se sigue AL INSTANTE.
        // Antes se esperaba como si fuera una llamada (20 s o más)
        const sinceHide = hiddenAtRef.current ? Date.now() - hiddenAtRef.current : document.visibilityState === 'hidden' ? 0 : -1
        if (el && (el.muted || (sinceHide >= 0 && sinceHide < 5000))) {
          el.muted = false
          for (const ms of [50, 400, 1200, 2500]) setTimeout(() => el.paused && useMusicStore.getState().isPlaying && el.play()?.catch?.(() => {}), ms)
          return
        }
        interruptedAtRef.current = Date.now()
        return
      }
      keepPlayingRef.current = false
      setIsPlaying(false)
      return
    }
    const hiddenFor = hiddenAtRef.current ? Date.now() - hiddenAtRef.current : -1
    // Pausa automática de YouTube al ir a segundo plano (también mientras se espera o se ve la
    // ventanita flotante): no la pidió el usuario (los botones y la pantalla de bloqueo cambian
    // primero el estado a «pausa»), así que la música sigue: se reanuda y, si la app ya no se ve,
    // pasa al audio propio
    const stillWanted = useMusicStore.getState().isPlaying
    if (document.visibilityState === 'hidden' && (stillWanted || (keepPlayingRef.current && hiddenFor >= 0 && hiddenFor < AUTO_RESUME_WINDOW_MS))) {
      keepPlayingRef.current = true
      setTimeout(resumeIfNeeded, 50)
      return
    }
    // YouTube se pausó con la app todavía visible y la app quiere sonar: puede ser el teléfono
    // bloqueándose (pausa el video un instante ANTES de avisar que la pantalla se apagó). Se espera
    // un momento: si la app quedó oculta, era el bloqueo y la música sigue (pasa al audio propio);
    // si no, la pausó el usuario desde el video
    if (stillWanted) {
      setTimeout(() => {
        if (document.visibilityState === 'hidden') {
          keepPlayingRef.current = true
          hiddenWantRef.current = true
          window.dispatchEvent(new Event(PIP_EVENT))
          return
        }
        if (useMusicStore.getState().isPlaying && (playerRef.current as unknown as HTMLMediaElement | null)?.paused) {
          keepPlayingRef.current = false
          setIsPlaying(false)
        }
      }, 900)
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
      // (por segundo de inicio: un video que pasa a audio varias veces sigue cada vez donde iba)
      if (cur?.startAt && startAppliedRef.current !== `${cur.id}@${cur.startAt}`) {
        startAppliedRef.current = `${cur.id}@${cur.startAt}`
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
      album: 'PulsoMedia',
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
  const queueFromFullRef = useRef(false)
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
  // Ir a otra página desde el reproductor (álbum, artista): primero se cierra (vuelve atrás en el
  // historial) y recién entonces se navega, si no el "atrás" anularía la navegación
  const navRouter = useRouter()
  const leaveFullTo = useCallback(
    (href: string) => {
      if (window.history.state?.cpnFullPlayer) {
        const go = () => {
          window.removeEventListener('popstate', go)
          setTimeout(() => navRouter.push(href), 0)
        }
        window.addEventListener('popstate', go)
        window.history.back()
      } else {
        setIsFullOpen(false)
        navRouter.push(href)
      }
    },
    [navRouter]
  )
  useEffect(() => {
    const onPop = () => setIsFullOpen(!!window.history.state?.cpnFullPlayer)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  useEffect(() => {
    if (!isBarShown) setIsFullOpen(false)
  }, [isBarShown])

  // Video en el reproductor: al cambiar de canción sigue con el video de la nueva (o vuelve a la
  // carátula si no tiene); al cerrar el reproductor sigue la canción desde donde iba el video
  useEffect(() => {
    if (!inlineRef.current) return
    const id = ytIdOf(currentVideo)
    if (id === inlineRef.current.id) return
    // Otra canción: suena su audio hasta que su video arranque
    videoOwnsRef.current = false
    if (!id) return setInline(null)
    setInline({ id, start: 0, place: inlineRef.current.place })
  }, [currentId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!isFullOpen && inlineRef.current && inlineRef.current.place !== 'float') backToSong()
  }, [isFullOpen, backToSong])
  // Se abre el reproductor grande con la ventana flotante puesta: el video pasa al reproductor
  useEffect(() => {
    if (isFullOpen && inlineRef.current?.place === 'float') moveInline('sheet')
  }, [isFullOpen]) // eslint-disable-line react-hooks/exhaustive-deps
  // Bloquear o salir con el video en el reproductor: sigue la canción (YouTube no suena en segundo
  // plano) y al volver, otra vez el video desde donde va
  useEffect(() => {
    let resume: { id: string; place?: 'sheet' | 'float' } | null = null
    const onVis = () => {
      if (appHidden()) {
        if (!inlineRef.current) return
        resume = { id: inlineRef.current.id, place: inlineRef.current.place }
        backToSong()
      } else if (resume) {
        const st = useMusicStore.getState()
        const el = playerRef.current as unknown as HTMLMediaElement | null
        if (ytIdOf(st.queue[st.currentIndex]) === resume.id) setInline({ id: resume.id, start: el && isFinite(el.currentTime) ? el.currentTime : 0, place: resume.place })
        resume = null
      }
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener(PIP_EVENT, onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener(PIP_EVENT, onVis)
    }
  }, [backToSong, showInline])

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
  const floating = !useAudio && !isExpanded && !videoHidden && !isLive && asVideo
  useEffect(() => setVideoHidden(false), [currentId])
  const [shareNotice, setShareNotice] = useState(false)
  const shareCurrent = useCallback(async () => {
    const v = useMusicStore.getState().queue[useMusicStore.getState().currentIndex]
    if (!v) return
    const url = await trackShareUrl(v)
    const text = `Escucha "${v.title}" en PulsoMedia`
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
    const send = () => {
      const time = (window as unknown as { __cpnTime?: () => { t: number; d: number } }).__cpnTime?.()
      reportMediaState({
        title: currentVideo ? currentVideo.title.replace(/^[^-–]+[-–]\s*/, '') || currentVideo.title : '',
        artist: currentVideo?.channelTitle || '',
        artwork: currentVideo?.thumbnail?.startsWith('http') ? currentVideo.thumbnail : undefined,
        playing: isPlaying,
        visible: isVisible && !!currentVideo,
        // Radios en vivo: sin barra de avance
        position: isLive ? undefined : time?.t,
        duration: isLive ? undefined : time?.d,
        liked: isCurrentSaved,
      })
    }
    send()
    // La notificación avanza sola; se corrige cada tanto (y al cargar la duración de la canción)
    const t1 = setTimeout(send, 1500)
    const iv = isPlaying ? setInterval(send, 15000) : undefined
    const el = playerRef.current as unknown as HTMLMediaElement | null
    el?.addEventListener?.('seeked', send)
    el?.addEventListener?.('durationchange', send)
    return () => {
      clearTimeout(t1)
      if (iv) clearInterval(iv)
      el?.removeEventListener?.('seeked', send)
      el?.removeEventListener?.('durationchange', send)
    }
  }, [currentVideo, isPlaying, isVisible, isLive, isCurrentSaved, audioUrl])
  useEffect(() => {
    if (!isNativeApp()) return
    ;(window as unknown as { __cpnNativeAction?: (a: string) => void }).__cpnNativeAction = (a: string) => {
      const st = useMusicStore.getState()
      if (a === 'play') {
        st.setIsPlaying(true)
        // Play desde la notificación o el widget tras un rato sin usar el teléfono: la dirección
        // del audio pudo vencer (YouTube las da por unas horas) y no arrancaba. Si a los 3 s no
        // avanza, se vuelve a pedir el audio desde el mismo segundo.
        const el0 = playerRef.current as unknown as HTMLMediaElement | null
        const t0 = el0?.currentTime ?? 0
        setTimeout(() => {
          const el = playerRef.current as unknown as HTMLMediaElement | null
          if (!useMusicStore.getState().isPlaying || !el) return
          if (!el.paused && el.currentTime > t0 + 0.5) return
          if (!useAudioRef.current) {
            // Sonaba por YouTube (que no suena con la app en segundo plano): se pasa al audio propio
            window.dispatchEvent(new Event(PIP_EVENT))
            return
          }
          const at = el.currentTime || t0
          try {
            const src = el.currentSrc || el.src
            if (/^http:\/\/127\.0\.0\.1:\d+\/yt\//.test(src)) el.src = src.replace(/\?.*$/, '') + '?r=1'
            else el.load()
            const seek = () => {
              el.removeEventListener('loadedmetadata', seek)
              try {
                if (at > 1) el.currentTime = at
              } catch {}
            }
            el.addEventListener('loadedmetadata', seek)
            el.play()?.catch?.(() => {})
          } catch {}
        }, 3000)
      } else if (a === 'pause') st.setIsPlaying(false)
      else if (a === 'next') st.playNext()
      else if (a === 'prev') st.playPrev()
      else if (a === 'route') window.dispatchEvent(new Event('cpn-audio-route'))
      else if (a === 'like') {
        // ♥ desde la notificación o el widget: igual que el corazón de la barra
        const v = st.queue[st.currentIndex]
        if (!v) return
        if (v.streamUrl) useLiveStore.getState().toggleFavoriteRadio(v)
        else st.toggleSaved(v)
      } else if (a.startsWith('seek:')) {
        // Barra de avance de la notificación (milisegundos)
        const ms = Number(a.slice(5))
        const el = playerRef.current as unknown as HTMLMediaElement | null
        if (el && isFinite(ms) && isFinite(el.duration) && el.duration > 0) el.currentTime = Math.min(ms / 1000, el.duration - 0.5)
      }
    }
  }, [])

  // ===== Transmitir la música o la radio a la TV (app de Android, Chromecast) =====
  const castDevice = useCastStore((s) => s.device)
  const castingMusic = !!castDevice && castKind() === 'music'
  const castingMusicRef = useRef(false)
  castingMusicRef.current = castingMusic
  const castTrack = useCallback((position = 0) => {
    const st = useMusicStore.getState()
    const v = st.queue[st.currentIndex]
    if (!v) return
    const yt = ytIdOf(v)
    const base = { title: v.title.replace(/^.+?\s[-–—]\s/, ''), subtitle: v.channelTitle, image: v.thumbnail, position, kind: 'music' as const }
    if (v.streamUrl) nativeCast({ ...base, url: v.streamUrl, live: true })
    else if (v.audioUrl && !/^\/api\/stream\?id=/.test(v.audioUrl)) nativeCast({ ...base, url: v.audioUrl })
    else if (yt) nativeCast({ ...base, yt, video: !!v.isVideo })
    else return
    st.setIsPlaying(false)
  }, [])
  // En la TV: al cambiar de canción, la TV pone la nueva; al terminar en la TV, sigue la cola
  const castedIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!castingMusic || !currentId) return
    if (castedIdRef.current === null) castedIdRef.current = currentId
    if (castedIdRef.current === currentId) return
    castedIdRef.current = currentId
    castTrack(0)
  }, [castingMusic, currentId, castTrack])
  useEffect(() => {
    if (!castingMusic) castedIdRef.current = null
  }, [castingMusic])
  useEffect(() => {
    const ended = () => castingMusicRef.current && useMusicStore.getState().playNext()
    window.addEventListener('cpn-cast-ended', ended)
    return () => window.removeEventListener('cpn-cast-ended', ended)
  }, [])
  // Con la música en la TV el teléfono no suena: «reproducir» le dice a la TV que siga
  useEffect(() => {
    if (!castingMusic || !isPlaying) return
    setIsPlaying(false)
    nativeCastControl('play')
  }, [castingMusic, isPlaying, setIsPlaying])

  // ¿La canción tiene video de YouTube? (no radios, archivos ni canciones aún sin buscar)
  // Como en Spotify: canción o video. También las convertidas a audio o descargadas (su video sigue en YouTube)
  const canWatchVideo = !!currentVideo && !isLive && !isLocalFile && !isPending && !!ytIdOf(currentVideo)

  // Cola: se cierra deslizando hacia abajo
  // Cola abierta desde el reproductor grande: al cerrarla se vuelve a él (antes te sacaba)
  const closeQueue = () => {
    if (useMusicStore.getState().isQueueOpen) toggleQueue()
    if (queueFromFullRef.current) {
      queueFromFullRef.current = false
      setTimeout(openFull, 200)
    }
  }
  const queueSwipe = useSwipeDown(closeQueue)
  if (!isBarShown) return null

  const progressPercent = isLive ? 100 : localPlayed * 100
  // Siguiente sigue disponible en la última si se repite todo o la radio traerá más
  const isLastInQueue =
    currentIndex >= queue.length - 1 && useMusicStore.getState().repeatMode !== 'all' && !(radioEnabled && !isLive)

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

  // Lo que hace el video del reproductor (en el reproductor o flotando): mismo comportamiento
  const inlineHandlers = {
    onPlaying: () => {
          // El video ya suena (parejo con la canción): la canción queda en pausa y el reproductor
          // sigue «sonando» (su play/pausa controla el video)
          videoOwnsRef.current = true
          const el = playerRef.current as unknown as HTMLMediaElement | null
          el?.pause()
          // Web: su audio queda guardado en el dispositivo (al bloquear sigue sin esperar internet)
          if (!isNativeApp() && inlineRef.current) cacheYtAudio(inlineRef.current.id)
          if (!useMusicStore.getState().isPlaying) useMusicStore.getState().setIsPlaying(true)
    },
    onState: (playing: boolean) => {
          if (!videoOwnsRef.current) return
          if (playing) {
            if (!useMusicStore.getState().isPlaying) useMusicStore.getState().setIsPlaying(true)
            return
          }
          // ¿Lo pausó el usuario o el teléfono al bloquear/salir? (el teléfono pausa el video un
          // instante antes de avisar): se espera; si la app quedó oculta, la canción sigue sola
          setTimeout(() => {
            if (document.visibilityState === 'hidden' || appHidden()) return
            if (videoOwnsRef.current && useMusicStore.getState().isPlaying) useMusicStore.getState().setIsPlaying(false)
          }, 900)
        },
    syncTo: () => {
          const el = playerRef.current as unknown as HTMLMediaElement | null
          return el && !el.paused && isFinite(el.currentTime) ? el.currentTime : inlineTimeRef.current
    },
    onEnded: () => {
          // Terminó el video: sigue la próxima canción con su video (o solo audio si no tiene)
          const st = useMusicStore.getState()
          if (st.currentIndex >= st.queue.length - 1) return backToSong(0)
          videoOwnsRef.current = false
          st.playNext()
    },
  }

  const iconBtn = 'p-2 sm:p-1.5 transition-colors'

  return (
    <>
      {videoModal && (
        <YoutubePlayer
          key={videoModal.id}
          onTrackChange={followVideo}
          onNext={() => {
            // Terminó el video: sigue la próxima canción (con su video si tiene; si no, solo audio)
            const st = useMusicStore.getState()
            if (st.currentIndex >= st.queue.length - 1) return setVideoModal(null)
            st.playNext()
            followVideo(0)
          }}
          videoId={videoModal.id}
          title={videoModal.title}
          channelTitle={videoModal.channelTitle}
          startTime={videoModal.startTime}
          onClose={(t) => {
            // Agrandado desde el reproductor: al cerrar vuelve al video en el reproductor
            if (expandedFromInlineRef.current) {
              expandedFromInlineRef.current = false
              setVideoModal(null)
              setInline({ id: videoModal.id, start: t ?? 0 })
              return
            }
            closeVideo(t)
          }}
          onSong={(t) => {
            expandedFromInlineRef.current = false
            closeVideo(t)
          }}
          songToggle
        />
      )}
      {/* Reserva el alto del reproductor para que no tape el contenido ni el footer */}
      <div aria-hidden style={{ height: barHeight }} />

      <NowPlayingSheet
        open={isFullOpen}
        onClose={closeFull}
        onNavigate={leaveFullTo}
        onOpenQueue={() => {
          closeFull()
          queueFromFullRef.current = true
          if (!useMusicStore.getState().isQueueOpen) toggleQueue()
        }}
        onWatchVideo={canWatchVideo ? showInline : undefined}
        inline={isFullOpen && inline?.place !== 'float' ? inline : null}
        onInlineFloat={() => {
          // A la ventana flotante: se cierra el reproductor y el video sigue flotando sobre la app
          moveInline('float')
          closeFull()
        }}
        inlineTimeRef={inlineTimeRef}
        onInlinePlaying={inlineHandlers.onPlaying}
        onInlineState={inlineHandlers.onState}
        inlineControlRef={inlineCtlRef}
        inlineSyncTo={inlineHandlers.syncTo}
        onInlineEnded={inlineHandlers.onEnded}
        onInlineExpand={() => {
          const cur = inlineRef.current
          if (!cur) return
          const st = useMusicStore.getState()
          const v = st.queue[st.currentIndex]
          expandedFromInlineRef.current = true
          videoOwnsRef.current = false
          // La pantalla grande sigue el video desde el mismo segundo (la canción queda en pausa)
          useMusicStore.getState().setIsPlaying(false)
          setInline(null)
          setVideoModal({ id: cur.id, title: v?.title ?? '', channelTitle: v?.channelTitle ?? '', startTime: inlineTimeRef.current })
        }}
        onCast={
          nativeCastAvailable() && currentVideo
            ? () => {
                castedIdRef.current = currentId ?? null
                castTrack(isLive ? 0 : localPlayed * localDuration)
              }
            : undefined
        }
        castDevice={castingMusic ? castDevice : null}
        onCastStop={() => {
          nativeCastStop()
          setIsPlaying(true)
        }}
        videoOn={asVideo && !useAudio}
        onSongOnly={() => {
          // «Canción» es una elección que se respeta: se apaga «Ver siempre el video» (las que
          // siguen también van como canción) y, si se veía el video, sigue solo el audio desde el
          // mismo segundo. Para ver un video: «Video».
          if (getAlwaysVideo()) setAlwaysVideo(false)
          if (inlineRef.current) return backToSong()
          if (!(asVideo && !useAudio)) return
          const st = useMusicStore.getState()
          pendingSeekRef.current = localPlayedRef.current
          useMusicStore.setState({ queue: st.queue.map((x, i) => (i === st.currentIndex ? { ...x, forceAudio: true } : x)) })
          setIsExpanded(false)
        }}
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
      <div ref={barRef} className="fixed bottom-14 sm:bottom-0 left-0 right-0 z-[80] select-none flex flex-col">
        {/* Ventana flotante con el video (sobre la app; al cerrarla la música sigue) */}
        {inline?.place === 'float' && (
          <div
            data-cpn-video={isPlaying ? 'playing' : 'paused'}
            className="absolute right-2 bottom-[calc(100%+12px)] z-10 w-[62vw] max-w-[360px] aspect-video rounded-xl overflow-hidden border border-white/15 shadow-[0_12px_40px_rgba(0,0,0,0.6)] bg-black"
          >
            <InlineVideo
              key={`${inline.id}-${inline.key ?? 0}`}
              videoId={inline.id}
              startAt={inline.start}
              timeRef={inlineTimeRef}
              controlRef={inlineCtlRef}
              onPlaying={inlineHandlers.onPlaying}
              onState={inlineHandlers.onState}
              onEnded={inlineHandlers.onEnded}
              syncTo={inlineHandlers.syncTo}
              onExpand={() => {
                // Agrandar: vuelve al reproductor grande con el video al medio
                moveInline('sheet')
                openFull()
              }}
              onCloseFloat={() => backToSong()}
            />
          </div>
        )}
        {(skipNotice || needsTap) && !isQueueOpen && (
          <div className="absolute bottom-full left-0 right-0 flex justify-center px-3 pb-2 pointer-events-none">
            <p className="max-w-full truncate bg-surface-2/[0.98] sm:bg-surface-2/95 sm:backdrop-blur-xl border border-white/10 text-slate-200 text-xs font-medium px-4 py-2 rounded-full shadow-lg">
              {needsTap ? 'Toca la pantalla para continuar la música' : `No disponible, saltando: ${skipNotice}`}
            </p>
          </div>
        )}

        {/* ===== QUEUE PANEL ===== */}
        {isQueueOpen && (
          <div style={queueSwipe.style} className="absolute bottom-full right-0 sm:right-4 sm:mb-2 w-full sm:w-80 max-h-[50vh] sm:max-h-[340px] bg-surface-1/[0.98] sm:bg-surface-1/95 sm:backdrop-blur-xl sm:backdrop-saturate-[1.8] border border-white/10 rounded-t-2xl sm:rounded-xl overflow-hidden shadow-2xl shadow-black/80 flex flex-col">
            {/* Arrastrar hacia abajo desde aquí cierra la cola */}
            <div {...queueSwipe.dragProps} className="shrink-0">
            <SheetHandle className="pb-0 pt-1.5" />
            <div className="flex items-center justify-between px-4 pb-3 pt-1 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2">
                <ListMusic className="w-4 h-4 text-violet-400" />
                <span className="text-white font-semibold text-sm">
                  Cola <span className="text-slate-500 font-normal">({queue.length})</span>
                </span>
              </div>
              <button onClick={closeQueue} className="p-1 text-slate-500 hover:text-white transition-colors" aria-label="Cerrar cola">
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
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

        {/* Barra de progreso. En el teléfono va debajo del reproductor, fina y sin tocarla (como en
            Spotify: así no se adelanta la canción al desplazar la página; se adelanta en la pantalla
            completa). En computador va arriba y se puede arrastrar. */}
        <div className="relative order-last sm:order-none h-0.5 sm:h-1 group sm:cursor-pointer bg-white/12">
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
            className="hidden sm:block absolute inset-x-0 -top-2 -bottom-2 w-full opacity-0 cursor-pointer touch-none disabled:hidden"
          />
          <div
            className="hidden sm:block absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-[0_0_10px_rgba(139,92,246,0.8)] pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ left: `clamp(0px, calc(${progressPercent}% - 6px), calc(100% - 12px))` }}
          />
        </div>

        <div className="relative bg-surface-1/[0.98] sm:bg-surface-1/90 sm:backdrop-blur-xl sm:backdrop-saturate-[1.8] shadow-rim border-t border-white/10 flex flex-wrap items-center">

          {/* Video — VISIBLE para que YouTube permita el audio. Se puede ampliar o poner a pantalla completa. */}
          <div
            ref={videoWrapRef}
            data-cpn-video={!useAudio && asVideo && currentVideo && !isLive ? (isPlaying ? 'playing' : 'paused') : undefined}
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
                  key={eqActive ? `eq-${eqEpoch}` : 'plain'}
                  ref={playerRef as unknown as React.Ref<HTMLAudioElement>}
                  crossOrigin={eqActive ? 'anonymous' : undefined}
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
                {!asVideo && (
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
                className={`${iconBtn} ${isLive ? 'hidden' : ''} ${audioBoost ? 'text-white bg-violet-500 rounded-full shadow-[0_0_12px_rgba(139,92,246,0.55)]' : 'text-slate-500 hover:text-white'}`}
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
                onClick={() => (isQueueOpen ? closeQueue() : toggleQueue())}
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
