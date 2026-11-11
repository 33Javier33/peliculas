'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX, Maximize, PictureInPicture2, Heart, Clock3, Share2, ExternalLink, X, Loader2, AlertCircle } from 'lucide-react'
import { useVideoStore } from '@/store/videoStore'
import { openFloat, closeFloat, floatingId } from '@/lib/float-window'
import { isPhoneScreen, openMini, useMiniStore } from '@/store/miniStore'
import { useMusicStore } from '@/store/musicStore'
import VideoAudioDownload from '@/components/VideoAudioDownload'
import { withAppParam } from '@/lib/app-flavor'
import type { V } from '@/lib/music-videos-data'

// Reproductor de PulsoTube: video grande, barra de controles propia, acciones y lo que sigue.
// Si YouTube no deja ver el video aquí, usa otra fuente (MP4) con los mismos controles.

const thumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
const fmt = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60).toString().padStart(2, '0')
  return h ? `${h}:${m.toString().padStart(2, '0')}:${sec}` : `${m}:${sec}`
}
const YT_ORIGIN = /^https:\/\/(www\.)?youtube(-nocookie)?\.com$/

export default function TubePlayer({ video, upNext, onPick, onClose, startAt = 0 }: { video: V; upNext: V[]; onPick: (v: V) => void; onClose?: () => void; startAt?: number }) {
  const box = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const media = useRef<HTMLVideoElement>(null)
  const [mode, setMode] = useState<'yt' | 'alt'>('yt')
  const [altUrl, setAltUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'blocked'>('loading')
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [dur, setDur] = useState(0)
  const [muted, setMuted] = useState(false)
  const [ended, setEnded] = useState(false)
  const [hover, setHover] = useState(true)
  const [floating, setFloating] = useState(floatingId() === video.id)
  const [note, setNote] = useState('')
  const timeRef = useRef(0)
  const isLiked = useVideoStore((s) => s.liked.some((v) => v.id === video.id))
  const isLater = useVideoStore((s) => s.watchLater.some((v) => v.id === video.id))
  const toggle = useVideoStore((s) => s.toggle)
  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  // Un video nuevo tiene el sonido: la canción de abajo se pausa y la miniatura anterior se cierra
  useEffect(() => {
    useMusicStore.getState().setIsPlaying(false)
    if (useMiniStore.getState().video) useMiniStore.getState().close()
  }, [video.id])

  // Cada video nuevo arranca de cero
  useEffect(() => {
    setMode('yt')
    setAltUrl(null)
    setStatus('loading')
    setPlaying(false)
    setTime(startAt)
    setDur(0)
    setEnded(false)
    timeRef.current = startAt
    setFloating(floatingId() === video.id)
  }, [video.id, startAt])

  const ytCmd = useCallback((func: string, args: unknown[] = []) => {
    frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*')
  }, [])

  // Otra fuente (MP4 con imagen y sonido) cuando YouTube no deja ver el video aquí
  const useAlt = useCallback(async () => {
    setStatus('loading')
    try {
      const d = (await fetch(`/api/video-source?id=${encodeURIComponent(video.id)}`).then((r) => r.json())) as { candidates?: { url: string }[] }
      const url = d.candidates?.[0]?.url
      if (!url) return setStatus('blocked')
      setAltUrl(url)
      setMode('alt')
    } catch {
      setStatus('blocked')
    }
  }, [video.id])

  // Mensajes del reproductor de YouTube: tiempo, duración, estado y errores
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!YT_ORIGIN.test(e.origin) || e.source !== frame.current?.contentWindow) return
      let d: { event?: string; info?: { currentTime?: number; duration?: number; playerState?: number } | number }
      try {
        d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
      } catch {
        return
      }
      if (d.event === 'onError') return void useAlt()
      const info = typeof d.info === 'object' ? d.info : undefined
      if (!info) return
      if (typeof info.currentTime === 'number') {
        timeRef.current = info.currentTime
        setTime(info.currentTime)
      }
      if (typeof info.duration === 'number' && info.duration > 0) setDur(info.duration)
      if (typeof info.playerState === 'number') {
        setStatus('ready')
        setPlaying(info.playerState === 1)
        setEnded(info.playerState === 0)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [useAlt, upNext])

  // Al terminar, pasa solo al siguiente
  useEffect(() => {
    if (ended && upNext[0]) {
      const n = upNext[0]
      const id = setTimeout(() => onPick(n), 1200)
      return () => clearTimeout(id)
    }
  }, [ended, upNext, onPick])

  // Mismos controles para las dos fuentes
  const toggleplay = () => {
    if (mode === 'alt') {
      const m = media.current
      if (!m) return
      m.paused ? m.play().catch(() => {}) : m.pause()
    } else {
      ytCmd(playing ? 'pauseVideo' : 'playVideo')
      if (!playing) ytCmd('unMute')
    }
  }
  const seek = (t: number) => {
    const to = Math.max(0, Math.min(t, dur || t))
    timeRef.current = to
    setTime(to)
    if (mode === 'alt' && media.current) media.current.currentTime = to
    else ytCmd('seekTo', [to, true])
  }
  const skip = (d: number) => seek(timeRef.current + d)
  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    if (mode === 'alt' && media.current) media.current.muted = next
    else ytCmd(next ? 'mute' : 'unMute')
  }
  const fullscreen = () => {
    const el = box.current
    if (!el) return
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else el.requestFullscreen?.().catch(() => {})
  }

  // Ventana flotante: el video sale a una ventana aparte y vuelve aquí en el mismo segundo
  const float = () => {
    // En el teléfono: miniatura movible; el sonido pasa al reproductor de abajo y esta página se cierra
    if (mode !== 'alt' && isPhoneScreen()) {
      openMini(video, timeRef.current || 0)
      onClose?.()
      return
    }
    if (mode === 'alt' && media.current) {
      media.current.requestPictureInPicture?.().catch(() => setNote('El navegador no permite la ventana flotante aquí'))
      return
    }
    const t = timeRef.current
    const ok = openFloat({
      videoId: video.id,
      start: t,
      onClosed: (sec) => {
        setFloating(false)
        timeRef.current = sec
        setTime(sec)
        ytCmd('seekTo', [sec, true])
        ytCmd('playVideo')
      },
    })
    if (!ok) return setNote('Permite las ventanas emergentes de este sitio para usar la ventana flotante')
    ytCmd('pauseVideo')
    setFloating(true)
  }

  const share = async () => {
    const url = withAppParam(`${origin}/play/${video.id}`)
    try {
      if (navigator.share) await navigator.share({ title: video.title, url })
      else {
        await navigator.clipboard.writeText(url)
        setNote('Enlace copiado')
      }
    } catch {}
  }

  const src = useMemo(
    () => `https://www.youtube-nocookie.com/embed/${video.id}?enablejsapi=1&autoplay=1&playsinline=1&controls=0&rel=0&modestbranding=1&hl=es${startAt > 1 ? `&start=${Math.floor(startAt)}` : ''}&origin=${encodeURIComponent(origin)}`,
    [video.id, origin, startAt]
  )

  const progress = dur > 0 ? (time / dur) * 100 : 0
  const pickedNext = upNext[0]

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        <div
          ref={box}
          className="group relative aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-2xl shadow-black/60 ring-1 ring-white/10"
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
        >
          {mode === 'yt' ? (
            <iframe ref={frame} key={video.id} src={src} title={video.title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen className="absolute inset-0 h-full w-full border-0" onLoad={() => frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*')} />
          ) : altUrl ? (
            <video ref={media} key={altUrl} src={altUrl} autoPlay playsInline className="absolute inset-0 h-full w-full bg-black" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setEnded(true)} onTimeUpdate={(e) => { timeRef.current = e.currentTarget.currentTime; setTime(e.currentTarget.currentTime) }} onDurationChange={(e) => setDur(e.currentTarget.duration || 0)} onPlaying={() => setStatus('ready')} onError={() => setStatus('blocked')} />
          ) : null}

          {/* Toque en el video: pausa o sigue */}
          {status !== 'blocked' && !floating && <button className="absolute inset-0 z-10" onClick={toggleplay} aria-label={playing ? 'Pausar' : 'Reproducir'} />}

          {status === 'loading' && !floating && (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
              <Loader2 className="h-9 w-9 animate-spin text-white/80" />
            </div>
          )}

          {status === 'blocked' && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-violet-950 via-black to-black p-6 text-center">
              <AlertCircle className="h-9 w-9 text-amber-300" />
              <p className="text-base font-bold text-white">Este video no se puede ver aquí</p>
              <p className="max-w-sm text-sm text-slate-400">Su dueño no permite verlo fuera de YouTube. El audio de la canción sigue disponible en Música.</p>
              <a href={`https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-black">
                <ExternalLink className="h-4 w-4" /> Abrir en YouTube
              </a>
            </div>
          )}

          {floating && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/85 p-6 text-center">
              <PictureInPicture2 className="h-9 w-9 text-violet-300" />
              <p className="text-base font-bold text-white">El video sigue en la ventana flotante</p>
              <p className="text-sm text-slate-400">Puedes navegar por la página mientras tanto.</p>
              <button onClick={() => closeFloat()} className="mt-1 rounded-full bg-violet-500 px-5 py-2.5 text-sm font-bold text-white">Traer de vuelta aquí</button>
            </div>
          )}

          {/* Barra de controles */}
          {status !== 'blocked' && !floating && (
            <div className={`absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-3 pb-2.5 pt-10 transition-opacity duration-200 ${hover || !playing ? 'opacity-100' : 'opacity-0'}`}>
              <input
                type="range"
                min={0}
                max={dur || 0}
                step={0.5}
                value={Math.min(time, dur || time)}
                onChange={(e) => seek(Number(e.target.value))}
                aria-label="Avance"
                className="mb-2 h-1.5 w-full cursor-pointer accent-violet-400"
                style={{ background: `linear-gradient(to right, #a78bfa ${progress}%, rgba(255,255,255,.25) ${progress}%)` }}
              />
              <div className="flex items-center gap-1 text-white">
                <button onClick={() => skip(-10)} className="rounded-full p-2 hover:bg-white/15" aria-label="Atrasar 10 segundos"><RotateCcw className="h-4 w-4" /></button>
                <button onClick={toggleplay} className="rounded-full p-2 hover:bg-white/15" aria-label={playing ? 'Pausar' : 'Reproducir'}>{playing ? <Pause className="h-5 w-5 fill-white" /> : <Play className="h-5 w-5 fill-white" />}</button>
                <button onClick={() => skip(10)} className="rounded-full p-2 hover:bg-white/15" aria-label="Adelantar 10 segundos"><RotateCw className="h-4 w-4" /></button>
                <span className="ml-1 font-mono text-xs tabular-nums text-slate-200">{fmt(time)} / {fmt(dur)}</span>
                <div className="ml-auto flex items-center gap-1">
                  <button onClick={toggleMute} className="rounded-full p-2 hover:bg-white/15" aria-label={muted ? 'Activar sonido' : 'Silenciar'}>{muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}</button>
                  <button onClick={float} className="rounded-full p-2 hover:bg-white/15" aria-label="Ventana flotante" title="Ventana flotante"><PictureInPicture2 className="h-4 w-4" /></button>
                  <button onClick={fullscreen} className="rounded-full p-2 hover:bg-white/15" aria-label="Pantalla completa"><Maximize className="h-4 w-4" /></button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold leading-snug text-white sm:text-xl">{video.title}</h2>
            <p className="mt-1 text-sm text-slate-400">{video.channel}{mode === 'alt' ? ' · otra fuente' : ''}</p>
          </div>
          {onClose && (
            <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Cerrar el video"><X className="h-5 w-5" /></button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Action active={isLiked} onClick={() => toggle('liked', { id: video.id, title: video.title, channelTitle: video.channel, thumbnail: thumb(video.id), duration: undefined })} icon={<Heart className={`h-4 w-4 ${isLiked ? 'fill-violet-300 text-violet-300' : ''}`} />} label={isLiked ? 'Me gusta' : 'Me gusta'} />
          <Action active={isLater} onClick={() => toggle('watchLater', { id: video.id, title: video.title, channelTitle: video.channel, thumbnail: thumb(video.id) })} icon={<Clock3 className="h-4 w-4" />} label={isLater ? 'Guardado para después' : 'Ver después'} />
          <VideoAudioDownload id={video.id} title={video.title} channelTitle={video.channel} className="!h-auto !rounded-full !border !border-white/10 !bg-surface-2/70 !px-4 !py-2 !text-sm !text-slate-200" />
          <Action onClick={share} icon={<Share2 className="h-4 w-4" />} label="Compartir" />
          <Action onClick={float} icon={<PictureInPicture2 className="h-4 w-4" />} label="Ventana flotante" />
          <a href={`https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-surface-2/70 px-4 py-2 text-sm font-semibold text-slate-200 hover:text-white">
            <ExternalLink className="h-4 w-4" /> YouTube
          </a>
        </div>
        {note && <p className="mt-2 text-xs text-amber-300">{note}</p>}
      </div>

      <aside className="min-w-0">
        <p className="mb-3 text-sm font-bold text-white">A continuación</p>
        <div className="flex flex-col gap-2.5">
          {upNext.slice(0, 12).map((v) => (
            <button key={v.id} onClick={() => onPick(v)} className="group flex gap-3 rounded-xl p-1.5 text-left hover:bg-white/5">
              <div className="relative aspect-video w-36 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                <Image src={thumb(v.id)} alt="" fill sizes="144px" className="object-cover" unoptimized />
              </div>
              <div className="min-w-0 py-0.5">
                <p className="line-clamp-2 text-sm font-semibold leading-snug text-white">{v.title}</p>
                <p className="mt-1 truncate text-xs text-slate-500">{v.channel}</p>
              </div>
            </button>
          ))}
          {!pickedNext && <p className="text-xs text-slate-500">No hay más videos por ahora.</p>}
        </div>
      </aside>
    </div>
  )
}

function Action({ icon, label, onClick, active = false }: { icon: React.ReactNode; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${active ? 'border-violet-400/60 bg-violet-500/20 text-violet-100' : 'border-white/10 bg-surface-2/70 text-slate-200 hover:text-white'}`}>
      {icon} {label}
    </button>
  )
}
