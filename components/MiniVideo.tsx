'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Play, Pause, X, Maximize2 } from 'lucide-react'
import { useMiniStore } from '@/store/miniStore'
import { useMusicStore } from '@/store/musicStore'

// Miniatura del video (teléfono). El sonido lo lleva el reproductor de abajo (no se corta con la
// pantalla bloqueada); el video va silenciado y se mantiene en el mismo segundo sin saltos:
// - pequeñas diferencias se corrigen acelerando o frenando un poco (sin cortar la imagen)
// - solo si se separa mucho se salta, y no más de una vez cada 8 s
// - al bloquear el teléfono el video se pausa, y al volver va al segundo del audio de una vez
const W = 208
const H = 117
const YT = /^https:\/\/(www\.)?youtube(-nocookie)?\.com$/

type Cmd = 'playVideo' | 'pauseVideo' | 'mute' | 'seekTo' | 'setPlaybackRate'

export default function MiniVideo() {
  const mini = useMiniStore((s) => s.video)
  const start = useMiniStore((s) => s.start)
  const close = useMiniStore((s) => s.close)
  const audioPlaying = useMusicStore((s) => s.isPlaying)
  const router = useRouter()
  const frame = useRef<HTMLIFrameElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const drag = useRef<{ dx: number; dy: number } | null>(null)
  const vTime = useRef(0)
  const vPlaying = useRef(false)
  const lastSeek = useRef(0)
  const [ready, setReady] = useState(false)

  const cmd = (func: Cmd, args: unknown[] = []) =>
    frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*')

  // Posición inicial: abajo a la derecha, sobre el reproductor y el menú
  useEffect(() => {
    if (mini && !pos) setPos({ x: window.innerWidth - W - 12, y: window.innerHeight - H - 150 })
  }, [mini, pos])

  // Mensajes del video: en qué segundo va y si está sonando
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!YT.test(e.origin) || e.source !== frame.current?.contentWindow) return
      try {
        const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
        if (typeof d?.info?.currentTime === 'number') vTime.current = d.info.currentTime
        if (typeof d?.info?.playerState === 'number') vPlaying.current = d.info.playerState === 1
      } catch {}
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // Al abrir: silencio y arranque; se repite hasta que el video confirme que corre
  useEffect(() => {
    if (!mini || !ready) return
    let tries = 0
    const iv = window.setInterval(() => {
      if (vPlaying.current || tries++ > 24) return window.clearInterval(iv)
      cmd('mute')
      cmd('playVideo')
    }, 500)
    return () => window.clearInterval(iv)
  }, [mini, ready]) // eslint-disable-line react-hooks/exhaustive-deps

  // Play y pausa del audio: el video los sigue
  const first = useRef(true)
  useEffect(() => {
    if (first.current) return void (first.current = false)
    if (!mini) return
    cmd(audioPlaying ? 'playVideo' : 'pauseVideo')
  }, [audioPlaying, mini]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sincronía suave: pequeñas diferencias con velocidad, saltos solo si se separa mucho
  useEffect(() => {
    if (!mini) return
    const iv = window.setInterval(() => {
      const w = window as unknown as { __cpnTime?: () => { t: number; d: number; paused: boolean } }
      const a = w.__cpnTime?.()
      if (!a || !a.d || a.paused || !vPlaying.current) return
      const drift = a.t - vTime.current
      const now = Date.now()
      if (Math.abs(drift) > 1.5 && now - lastSeek.current > 8000) {
        lastSeek.current = now
        vTime.current = a.t
        cmd('seekTo', [a.t, true])
        cmd('setPlaybackRate', [1])
      } else if (Math.abs(drift) > 0.25) {
        cmd('setPlaybackRate', [drift > 0 ? 1.05 : 0.95])
      } else {
        cmd('setPlaybackRate', [1])
      }
    }, 1000)
    return () => window.clearInterval(iv)
  }, [mini]) // eslint-disable-line react-hooks/exhaustive-deps

  // Pantalla bloqueada o app en segundo plano: el video se pausa (el audio sigue abajo).
  // Al volver: va al segundo del audio y sigue, sin esperar a que se note.
  useEffect(() => {
    if (!mini) return
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        cmd('pauseVideo')
        return
      }
      const w = window as unknown as { __cpnTime?: () => { t: number; d: number; paused: boolean } }
      const a = w.__cpnTime?.()
      if (a && a.d && !a.paused) {
        vTime.current = a.t
        lastSeek.current = Date.now()
        cmd('seekTo', [a.t, true])
        cmd('playVideo')
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [mini]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mini) setReady(false)
  }, [mini])

  if (!mini || !pos) return null

  const togglePlay = () => useMusicStore.getState().setIsPlaying(!useMusicStore.getState().isPlaying)
  // Volver al video grande: el sonido sigue en el reproductor y la página del video toma el mismo segundo
  const expand = () => {
    const w = window as unknown as { __cpnTime?: () => { t: number } }
    const t = Math.floor(w.__cpnTime?.().t ?? vTime.current)
    useMusicStore.getState().setIsPlaying(false)
    close()
    router.push(`/tube?play=${encodeURIComponent(mini.id)}&t=${t}`)
  }

  const src = `https://www.youtube-nocookie.com/embed/${mini.id}?enablejsapi=1&autoplay=1&mute=1&playsinline=1&controls=0&rel=0&modestbranding=1&hl=es&start=${Math.floor(start)}&origin=${encodeURIComponent(window.location.origin)}`

  return (
    <div
      className="fixed z-[90] select-none touch-none overflow-hidden rounded-xl bg-black shadow-[0_10px_30px_rgba(0,0,0,0.6)] ring-1 ring-white/20"
      style={{ left: pos.x, top: pos.y, width: W, height: H }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) return
        drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        if (!drag.current) return
        const x = Math.min(window.innerWidth - W - 4, Math.max(4, e.clientX - drag.current.dx))
        const y = Math.min(window.innerHeight - H - 4, Math.max(4, e.clientY - drag.current.dy))
        setPos({ x, y })
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
    >
      <iframe
        ref={frame}
        src={src}
        title={mini.title}
        allow="autoplay; encrypted-media; picture-in-picture"
        className="pointer-events-none absolute inset-0 h-full w-full border-0"
        onLoad={() => {
          setReady(true)
          frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*')
        }}
      />
      {!ready && <div className="absolute inset-0 bg-black" />}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent p-1">
        <button onClick={expand} className="rounded-full bg-black/50 p-1.5 text-white" aria-label="Ver el video grande"><Maximize2 className="h-3.5 w-3.5" /></button>
        <button onClick={close} className="rounded-full bg-black/50 p-1.5 text-white" aria-label="Cerrar la miniatura (la música sigue)"><X className="h-3.5 w-3.5" /></button>
      </div>
      <button onClick={togglePlay} className="absolute bottom-1.5 left-1.5 rounded-full bg-black/60 p-1.5 text-white" aria-label={audioPlaying ? 'Pausar' : 'Reproducir'}>
        {audioPlaying ? <Pause className="h-3.5 w-3.5 fill-white" /> : <Play className="h-3.5 w-3.5 fill-white" />}
      </button>
      <p className="pointer-events-none absolute bottom-1.5 right-2 max-w-[60%] truncate text-[10px] font-semibold text-white drop-shadow">{mini.title}</p>
    </div>
  )
}
