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
} from 'lucide-react'
import { useMusicStore } from '@/store/musicStore'
// react-player v3 — ref is HTMLVideoElement, props use native HTML video API
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ReactPlayer = dynamic(() => import('react-player'), { ssr: false }) as any

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
    consumeResume,
  } = useMusicStore()

  const currentVideo = queue[currentIndex]
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

  // react-player v3: onTimeUpdate receives a React.SyntheticEvent<HTMLVideoElement>
  const handleTimeUpdate = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
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
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
      const d = e.currentTarget.duration
      if (isFinite(d) && d > 0) {
        setDuration(d)
        setLocalDuration(d)
      }
    },
    [setDuration]
  )

  const handleEnded = useCallback(() => playNext(), [playNext])
  const handlePlay = useCallback(() => {
    setIsPlaying(true)
    attachAudioGraph()
  }, [setIsPlaying, attachAudioGraph])
  const handlePause = useCallback(() => setIsPlaying(false), [setIsPlaying])

  const handleLoadedMetadata = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
      const el = e.currentTarget
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

  const handleSeekMouseDown = () => setIsSeeking(true)

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setLocalPlayed(parseFloat(e.target.value))

  const handleSeekMouseUp = (e: React.MouseEvent<HTMLInputElement>) => {
    setIsSeeking(false)
    const fraction = parseFloat((e.target as HTMLInputElement).value)
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

  const youtubeUrl = currentVideo
    ? `https://www.youtube.com/watch?v=${currentVideo.id}`
    : ''

  if (!hasHydrated || !isVisible || !currentVideo) return null

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
        hl: 'es',
        disablekb: 0,
        // Hint YouTube to pick a high-definition stream (audio bitrate improves alongside video quality on YT)
        vq: 'hd720',
        hd: 1,
      },
    },
  }

  return (
    <>
      {/* ===== PLAYER BAR ===== */}
      <div className="fixed bottom-0 left-0 right-0 z-[80] select-none">
        {/* Thin scrubber bar */}
        <div className="relative h-1 group cursor-pointer bg-white/5">
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
            onMouseDown={handleSeekMouseDown}
            onChange={handleSeekChange}
            onMouseUp={handleSeekMouseUp}
            aria-label="Progreso"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ left: `clamp(6px, calc(${progressPercent}% - 6px), calc(100% - 6px))` }}
          />
        </div>

        <div className="bg-black/95 backdrop-blur-xl border-t border-white/10 flex items-stretch">

          {/* Mini video player — VISIBLE para que YouTube permita el audio */}
          <div className="relative shrink-0 bg-black overflow-hidden" style={{ width: 142, height: 80 }}>
            <ReactPlayer {...playerProps} />
          </div>

          {/* Controls */}
          <div className="flex-1 flex items-center px-3 sm:px-5 py-2 gap-3 sm:gap-5 min-w-0">

            {/* Song info */}
            <div className="min-w-0 flex-1 sm:w-52 sm:flex-none">
              <p className="text-white text-xs sm:text-sm font-medium leading-tight truncate">
                {currentVideo.title}
              </p>
              <p className="text-slate-500 text-xs truncate mt-0.5">{currentVideo.channelTitle}</p>
            </div>

            {/* Playback buttons + time */}
            <div className="flex flex-col items-center gap-0.5 shrink-0">
              <div className="flex items-center gap-1 sm:gap-3">
                <button
                  onClick={playPrev}
                  className="p-2 text-slate-400 hover:text-white transition-colors hidden sm:flex"
                  title="Anterior"
                >
                  <SkipBack className="w-4 h-4" />
                </button>

                <button
                  onClick={togglePlay}
                  className="w-9 h-9 bg-white hover:bg-slate-100 rounded-full flex items-center justify-center transition-all hover:scale-105 shadow-lg"
                  title={isPlaying ? 'Pausar' : 'Reproducir'}
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

            {/* Right actions */}
            <div
              className="flex items-center gap-1 sm:gap-2 sm:w-52 justify-end shrink-0"
              onMouseEnter={() => setShowVolumeSlider(true)}
              onMouseLeave={() => setShowVolumeSlider(false)}
            >
              <div className="hidden md:flex items-center gap-2">
                <button
                  onClick={toggleMute}
                  className="p-1.5 text-slate-400 hover:text-white transition-colors"
                  title={isMuted ? 'Activar sonido' : 'Silenciar'}
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-4 h-4" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
                <div
                  className={`overflow-hidden transition-all duration-200 ${showVolumeSlider ? 'w-20 opacity-100' : 'w-0 opacity-0'}`}
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
                className={`p-1.5 transition-colors ${
                  isCurrentSaved ? 'text-pink-500 hover:text-pink-400' : 'text-slate-500 hover:text-white'
                }`}
                title={isCurrentSaved ? 'Quitar de guardadas' : 'Guardar canción'}
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
                className={`p-1.5 transition-colors hidden sm:flex ${
                  audioBoost ? 'text-amber-400' : 'text-slate-500 hover:text-white'
                }`}
                title={audioBoost ? 'Audio mejorado activado' : 'Mejorar audio (compresor + boost)'}
                aria-pressed={audioBoost}
              >
                <Sparkles className="w-4 h-4" />
              </button>

              <button
                onClick={handlePiP}
                className="p-1.5 text-slate-500 hover:text-white transition-colors hidden sm:flex"
                title="Picture-in-Picture"
              >
                <PictureInPicture2 className="w-4 h-4" />
              </button>

              <button
                onClick={toggleQueue}
                className={`p-1.5 transition-colors ${isQueueOpen ? 'text-purple-400' : 'text-slate-500 hover:text-white'}`}
                title={`Cola (${queue.length})`}
              >
                <ListMusic className="w-4 h-4" />
              </button>

              <button
                onClick={dismiss}
                className="p-1.5 text-slate-600 hover:text-white transition-colors"
                title="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ===== QUEUE PANEL ===== */}
      {isQueueOpen && (
        <div className="fixed bottom-[82px] right-0 sm:right-4 z-[79] w-full sm:w-80 max-h-[340px] bg-[#0d0d0d]/98 backdrop-blur-xl border border-white/10 sm:rounded-xl overflow-hidden shadow-2xl shadow-black/80 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-2">
              <ListMusic className="w-4 h-4 text-purple-400" />
              <span className="text-white font-semibold text-sm">
                Cola <span className="text-slate-500 font-normal">({queue.length})</span>
              </span>
            </div>
            <button onClick={toggleQueue} className="p-1 text-slate-500 hover:text-white transition-colors">
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
                  className="p-1 text-slate-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"
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

          <div className="px-4 py-2.5 border-t border-white/5 shrink-0">
            <p className="text-slate-700 text-xs flex items-center gap-1.5">
              <Plus className="w-3 h-3" />
              Clic en + en cualquier tarjeta para añadir a la cola
            </p>
          </div>
        </div>
      )}
    </>
  )
}
