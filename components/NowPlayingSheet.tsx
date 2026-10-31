'use client'

import { useShallow } from 'zustand/react/shallow'
import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import LiveArtwork from '@/components/LiveArtwork'
import FollowByName from '@/components/FollowByName'
import TrackMenu from '@/components/TrackMenu'
import { useEqStore } from '@/store/eqStore'
import { trackShareUrl } from '@/lib/share'
import {
  ChevronDown,
  ListMusic,
  Heart,
  Shuffle,
  SkipBack,
  SkipForward,
  Play,
  Pause,
  Repeat,
  Repeat1,
  Headphones,
  MonitorPlay,
  Share2,
  Radio,
  Loader2,
  MoreVertical,
  SlidersHorizontal,
} from 'lucide-react'
import { useMusicStore, parseTrackMeta } from '@/store/musicStore'
import { useLiveStore } from '@/store/liveStore'

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// Alturas fijas del visualizador decorativo (se animan mientras suena)
const BARS = [30, 55, 40, 80, 50, 95, 65, 45, 85, 35, 70, 50, 90, 40, 60, 30, 75, 45]

interface NowPlayingSheetProps {
  open: boolean
  onClose: () => void
  /** Cerrar el reproductor e ir a otra página (álbum, artista) */
  onNavigate: (href: string) => void
  onOpenQueue: () => void
  onSwitchMode: (toAudio: boolean) => void
  /** Abrir el video de la canción aparte (si tiene) */
  onWatchVideo?: () => void
  isAudioLoading: boolean
  played: number
  duration: number
  onSeek: (fraction: number) => void
}

/** Pantalla completa "Reproduciendo ahora" (se abre al tocar la canción en el mini reproductor). */
export default function NowPlayingSheet({
  open,
  onClose,
  onNavigate,
  onOpenQueue,
  onSwitchMode,
  onWatchVideo,
  isAudioLoading,
  played,
  duration,
  onSeek,
}: NowPlayingSheetProps) {
  const {
    queue,
    currentIndex,
    isPlaying,
    saved,
    audioMode,
    radioEnabled,
    repeatMode,
    shuffle,
    togglePlay,
    playNext,
    playPrev,
    toggleSaved,
    cycleRepeat,
    toggleShuffle,
  } = useMusicStore(
    useShallow((s) => ({
      queue: s.queue,
      currentIndex: s.currentIndex,
      isPlaying: s.isPlaying,
      saved: s.saved,
      audioMode: s.audioMode,
      radioEnabled: s.radioEnabled,
      repeatMode: s.repeatMode,
      shuffle: s.shuffle,
      togglePlay: s.togglePlay,
      playNext: s.playNext,
      playPrev: s.playPrev,
      toggleSaved: s.toggleSaved,
      cycleRepeat: s.cycleRepeat,
      toggleShuffle: s.toggleShuffle,
    }))
  )
  const video = queue[currentIndex]
  const { favoriteRadios, toggleFavoriteRadio } = useLiveStore()
  const [dragValue, setDragValue] = useState<number | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  // Cerrado: fuera del foco y de los lectores de pantalla
  useEffect(() => {
    if (rootRef.current) rootRef.current.inert = !open
  }, [open])

  // Bloquea el scroll de la página detrás
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!video) return null

  const isLive = !!video.streamUrl
  const isSaved = (isLive ? favoriteRadios : saved).some((t) => t.id === video.id)
  const artist = isLive ? video.channelTitle : parseTrackMeta(video).artist || video.channelTitle
  // "Artista - Canción" → título solo con la canción (las radios conservan su nombre)
  const songTitle = isLive ? video.title : video.title.replace(/^[^-–]+[-–]\s*/, '') || video.title
  const value = dragValue ?? played
  const elapsed = value * duration
  const isLast = currentIndex >= queue.length - 1
  const source = isLive ? 'Radio en vivo' : radioEnabled && isLast ? 'Radio' : `Tu cola · ${currentIndex + 1} de ${queue.length}`

  const [copied, setCopied] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const eqOn = useEqStore((s) => s.enabled && s.applies)
  useEffect(() => {
    if (!open) setMenuOpen(false)
  }, [open])
  // Enlace a la propia app: quien lo abra la escucha aquí (YouTube, discos de archive.org y MP3)
  const handleShare = async () => {
    const url = await trackShareUrl(video)
    const text = `Escucha "${songTitle}"${artist ? ` de ${artist}` : ''} en Carlos P. Nauto Interactive`
    try {
      if (navigator.share) {
        await navigator.share({ title: video.title, text, url })
      } else {
        await navigator.clipboard.writeText(`${text}\n${url}`)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch {}
  }

  const sideBtn = (active: boolean) =>
    `relative w-11 h-11 flex items-center justify-center transition-colors ${
      active ? 'text-emerald-400' : 'text-slate-400 hover:text-white'
    }`

  return (
    <div
      ref={rootRef}
      className={`fixed inset-0 z-[90] bg-obsidian transition-transform duration-300 ease-out ${
        open ? 'translate-y-0' : 'translate-y-full pointer-events-none'
      }`}
      role="dialog"
      aria-modal="true"
      aria-label="Reproduciendo ahora"
      aria-hidden={!open}
    >
      {/* Luz ambiental tomada de la portada */}
      {video.thumbnail && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
          <Image src={video.thumbnail} alt="" fill sizes="100vw" className="object-cover scale-150 blur-3xl opacity-30" unoptimized={isLive} />
          <div className="absolute inset-0 bg-gradient-to-b from-obsidian/40 via-obsidian/70 to-obsidian" />
        </div>
      )}

      <div className="relative h-full overflow-y-auto">
        <div className="max-w-md mx-auto min-h-full flex flex-col px-5 pt-[max(env(safe-area-inset-top),12px)] pb-[max(env(safe-area-inset-bottom),20px)]">
          {/* Barra superior */}
          <div className="flex items-center justify-between py-2">
            <button
              onClick={onClose}
              className="w-11 h-11 rounded-full bg-surface-2/70 border border-white/8 flex items-center justify-center text-slate-200"
              aria-label="Cerrar reproductor"
            >
              <ChevronDown className="w-5 h-5" />
            </button>
            <div className="text-center min-w-0 px-3">
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-[0.12em] font-display">
                Reproduciendo de
              </p>
              <p className="text-white text-sm font-bold font-display truncate flex items-center justify-center gap-1.5">
                {radioEnabled && isLast && <Radio className="w-3.5 h-3.5 text-violet-300" />}
                {source}
              </p>
            </div>
            <button
              onClick={onOpenQueue}
              className="w-11 h-11 rounded-full bg-surface-2/70 border border-white/8 flex items-center justify-center text-slate-200"
              aria-label="Ver cola"
            >
              <ListMusic className="w-5 h-5" />
            </button>
          </div>

          {/* Portada */}
          <div className="mt-4 mb-6">
            <div className="relative w-full max-w-[min(100%,44vh)] mx-auto aspect-square rounded-2xl overflow-hidden bg-surface-2 shadow-[0_20px_60px_rgba(139,92,246,0.35)] border border-white/10">
              {isLive ? (
                <LiveArtwork src={video.thumbnail} alt={video.title} sizes="(max-width: 448px) 90vw, 400px" imageClassName="object-contain p-10" />
              ) : (
                video.thumbnail && (
                  <Image src={video.thumbnail} alt={video.title} fill sizes="(max-width: 448px) 90vw, 400px" className="object-cover" priority />
                )
              )}
              {isLive ? (
                <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 bg-black/60 backdrop-blur-md text-emerald-400 text-[10px] font-bold uppercase tracking-[0.08em] px-2.5 py-1 rounded-full font-display">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> En vivo
                </span>
              ) : audioMode && (
                <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 bg-black/60 backdrop-blur-md text-emerald-400 text-[10px] font-bold uppercase tracking-[0.08em] px-2.5 py-1 rounded-full font-display">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Modo audio
                </span>
              )}
            </div>
          </div>

          {/* Título + favorito */}
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-white text-[28px] leading-[34px] font-extrabold line-clamp-2">{songTitle}</h2>
              <p className="text-slate-400 text-base truncate mt-1">{artist}</p>
              {!isLive && artist && <FollowByName name={artist} onNavigate={onNavigate} />}
            </div>
            {!isLive && (
              <button
                onClick={() => setMenuOpen(true)}
                className="shrink-0 w-12 h-12 rounded-full bg-surface-2/70 border border-white/8 flex items-center justify-center text-slate-300"
                aria-label="Más opciones: álbum, artista y discografía"
              >
                <MoreVertical className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={() => (isLive ? toggleFavoriteRadio(video) : toggleSaved(video))}
              className={`shrink-0 w-12 h-12 rounded-full border flex items-center justify-center transition-colors ${
                isSaved
                  ? 'bg-violet-500/20 border-violet-400/40 text-violet-300'
                  : 'bg-surface-2/70 border-white/8 text-slate-300'
              }`}
              aria-label={isSaved ? 'Quitar de guardadas' : 'Guardar'}
              aria-pressed={isSaved}
            >
              <Heart className={`w-5 h-5 ${isSaved ? 'fill-violet-300' : ''}`} />
            </button>
          </div>

          {/* Visualizador */}
          <div className="flex items-end justify-between gap-1 h-10 mt-6" aria-hidden>
            {BARS.map((h, i) => (
              <span
                key={i}
                className={`w-1 rounded-full origin-bottom ${
                  i / BARS.length <= value ? (i % 3 === 1 ? 'bg-emerald-400' : 'bg-violet-400') : 'bg-white/15'
                } ${isPlaying ? 'animate-eq' : ''}`}
                style={{ height: `${h}%`, animationDelay: `${(i % 6) * 120}ms` }}
              />
            ))}
          </div>

          {/* Progreso (las radios en vivo no tienen duración) */}
          {isLive ? (
            <div className="mt-3 h-[52px] flex flex-col justify-center">
              <div className="h-1 rounded-full bg-gradient-to-r from-emerald-500 via-violet-500 to-purple-500" />
              <p className="flex items-center gap-1.5 text-emerald-400 text-xs font-bold uppercase tracking-[0.08em] font-display mt-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Transmisión en vivo
              </p>
            </div>
          ) : (
          <div className="mt-3">
            <div className="relative h-6 flex items-center group">
              <div className="absolute inset-x-0 h-1 group-active:h-1.5 rounded-full bg-white/12 overflow-hidden transition-all">
                <div
                  className="h-full bg-gradient-to-r from-violet-500 to-purple-500"
                  style={{ width: `${value * 100}%` }}
                />
              </div>
              <div
                className="absolute w-3.5 h-3.5 rounded-full bg-white shadow-[0_0_12px_rgba(139,92,246,0.9)] pointer-events-none"
                style={{ left: `calc(${value * 100}% - 7px)` }}
              />
              <input
                type="range"
                min={0}
                max={1}
                step={0.001}
                value={value}
                onChange={(e) => setDragValue(parseFloat(e.target.value))}
                onPointerUp={(e) => {
                  onSeek(parseFloat(e.currentTarget.value))
                  setDragValue(null)
                }}
                onKeyUp={(e) => {
                  onSeek(parseFloat(e.currentTarget.value))
                  setDragValue(null)
                }}
                aria-label="Progreso"
                className="absolute inset-0 w-full opacity-0 cursor-pointer touch-none"
              />
            </div>
            <div className="flex justify-between text-xs text-slate-400 font-mono mt-1">
              <span>{formatTime(elapsed)}</span>
              <span>-{formatTime(Math.max(0, duration - elapsed))}</span>
            </div>
          </div>
          )}

          {/* Controles */}
          <div className="flex items-center justify-between mt-5">
            <button onClick={toggleShuffle} className={sideBtn(shuffle)} aria-label="Mezclar" aria-pressed={shuffle}>
              <Shuffle className="w-5 h-5" />
              {shuffle && <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-emerald-400" />}
            </button>
            <button onClick={playPrev} className="w-14 h-14 flex items-center justify-center text-white" aria-label="Anterior">
              <SkipBack className="w-7 h-7 fill-white" />
            </button>
            <button
              onClick={togglePlay}
              className="w-20 h-20 rounded-full bg-violet-300 hover:bg-violet-200 text-violet-950 flex items-center justify-center shadow-[0_8px_32px_rgba(139,92,246,0.55)] transition-colors"
              aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
            >
              {isAudioLoading && isPlaying ? (
                <Loader2 className="w-8 h-8 animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-8 h-8 fill-violet-950" />
              ) : (
                <Play className="w-8 h-8 fill-violet-950 ml-1" />
              )}
            </button>
            <button
              onClick={playNext}
              disabled={isLast && repeatMode !== 'all' && !radioEnabled}
              className="w-14 h-14 flex items-center justify-center text-white disabled:opacity-30"
              aria-label="Siguiente"
            >
              <SkipForward className="w-7 h-7 fill-white" />
            </button>
            <button
              onClick={cycleRepeat}
              className={sideBtn(repeatMode !== 'off')}
              aria-label={repeatMode === 'one' ? 'Repetir una' : repeatMode === 'all' ? 'Repetir todo' : 'Repetir'}
            >
              {repeatMode === 'one' ? <Repeat1 className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
              {repeatMode !== 'off' && <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-emerald-400" />}
            </button>
          </div>

          {/* Modo audio / video: Música es solo audio (los videos están en la sección Videos) */}
          {false && !isLive && (
          <button
            onClick={() => onSwitchMode(!audioMode)}
            className="mt-6 w-full flex items-center gap-3 bg-surface-1/80 backdrop-blur-xl border border-white/8 rounded-2xl px-4 py-3 text-left"
          >
            <span
              className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                audioMode ? 'bg-emerald-500/15 text-emerald-400' : 'bg-violet-500/15 text-violet-300'
              }`}
            >
              {audioMode ? <Headphones className="w-5 h-5" /> : <MonitorPlay className="w-5 h-5" />}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={`block text-[11px] font-bold uppercase tracking-[0.06em] font-display ${
                  audioMode ? 'text-emerald-400' : 'text-violet-300'
                }`}
              >
                {audioMode ? 'Modo audio' : 'Modo video'}
              </span>
              <span className="block text-slate-300 text-sm truncate">
                {audioMode ? 'Sigue sonando en segundo plano · toca para ver video' : 'Toca para volver al modo audio'}
              </span>
            </span>
          </button>

          )}

          {/* Acciones */}
          <div className={`grid ${isLive ? 'grid-cols-1 mt-6' : 'grid-cols-2 mt-3'} gap-3`}>
            <button
              onClick={handleShare}
              className={`${isLive ? 'hidden' : 'flex'} items-center justify-center gap-2 bg-surface-1/80 border border-white/8 rounded-2xl py-3 text-slate-200 text-sm font-semibold font-display`}
            >
              <Share2 className="w-4 h-4" /> {copied ? 'Enlace copiado' : 'Compartir'}
            </button>
            {onWatchVideo && (
              <button
                onClick={onWatchVideo}
                className="flex items-center justify-center gap-2 bg-surface-1/80 border border-white/8 rounded-2xl py-3 text-slate-200 text-sm font-semibold font-display"
              >
                <MonitorPlay className="w-4 h-4" /> Ver el video
              </button>
            )}
            <button
              onClick={onOpenQueue}
              className="flex items-center justify-center gap-2 bg-surface-1/80 border border-white/8 rounded-2xl py-3 text-slate-200 text-sm font-semibold font-display"
            >
              <ListMusic className="w-4 h-4" /> Cola ({queue.length})
            </button>
            {!isLive && (
              <button
                onClick={() => useEqStore.getState().setOpen(true)}
                className={`flex items-center justify-center gap-2 border rounded-2xl py-3 text-sm font-semibold font-display ${
                  eqOn ? 'bg-violet-500/15 border-violet-400/40 text-violet-200' : 'bg-surface-1/80 border-white/8 text-slate-200'
                }`}
              >
                <SlidersHorizontal className="w-4 h-4" /> Ecualizador{eqOn ? ' · activo' : ''}
              </button>
            )}
          </div>
        </div>
      </div>
      {menuOpen && !isLive && (
        <TrackMenu video={video} artist={artist} title={songTitle} onClose={() => setMenuOpen(false)} onNavigate={onNavigate} />
      )}
    </div>
  )
}
