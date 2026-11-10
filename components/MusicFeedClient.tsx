'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Heart, Share2, Headphones, Loader2, ExternalLink } from 'lucide-react'
import { useMusicStore } from '@/store/musicStore'
import { useMyArtists, artistVideoRows, videoOf, type V } from '@/lib/music-videos-data'
import { withAppParam } from '@/lib/app-flavor'

// Videos para ti, a pantalla completa y en vertical (como los Shorts de YouTube Music): los videos de
// tus artistas y de los parecidos. Se desliza hacia arriba; el video que se ve suena (toca para pausar).

const YT_ORIGIN = /^https:\/\/(www\.)?youtube(-nocookie)?\.com$/

export default function MusicFeedClient() {
  const router = useRouter()
  const mine = useMyArtists()
  const [videos, setVideos] = useState<V[]>([])
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState(0)

  // Al abrir el feed se pausa la música del reproductor (no pueden sonar dos cosas)
  useEffect(() => {
    useMusicStore.getState().setIsPlaying(false)
  }, [])

  useEffect(() => {
    if (!mine.length) return setLoading(false)
    let alive = true
    artistVideoRows(mine.slice(0, 4), mine, (rows) => {
      if (!alive) return
      const list: V[] = []
      const ids = new Set<string>()
      for (const r of rows) for (const v of r.items) if (!ids.has(v.id)) (ids.add(v.id), list.push(v))
      setVideos(list.slice(0, 60))
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [mine.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-[100] bg-black text-white">
      <div className="absolute top-0 inset-x-0 z-20 flex items-center gap-3 px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
        <Link href="/music/videos" className="pointer-events-auto w-10 h-10 rounded-full bg-black/50 flex items-center justify-center" aria-label="Volver a videos">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <p className="font-bold text-sm">Videos para ti</p>
      </div>

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-300">
          <Loader2 className="w-7 h-7 animate-spin" />
        </div>
      )}
      {!loading && videos.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
          <p className="text-lg font-semibold">Aún no hay videos para ti</p>
          <p className="text-slate-400 text-sm">Sigue artistas o guarda canciones en tu biblioteca y aquí aparecen sus videos.</p>
          <Link href="/music" className="mt-2 text-violet-300 underline text-sm">Ir a Música</Link>
        </div>
      )}

      <div
        className="h-full w-full overflow-y-scroll snap-y snap-mandatory overscroll-contain [scrollbar-width:none]"
        onScroll={(e) => {
          const el = e.currentTarget
          const i = Math.round(el.scrollTop / el.clientHeight)
          if (i !== active) setActive(i)
        }}
      >
        {videos.map((v, i) => (
          <FeedItem
            key={v.id}
            v={v}
            near={Math.abs(i - active) <= 1}
            isActive={i === active}
            onSong={() => {
              useMusicStore.getState().play([videoOf(v)], 0)
              useMusicStore.getState().setIsPlaying(true)
              router.push('/music')
            }}
          />
        ))}
      </div>
    </div>
  )
}

function FeedItem({ v, isActive, near, onSong }: { v: V; isActive: boolean; near: boolean; onSong: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [unmuted, setUnmuted] = useState(false)
  const [paused, setPaused] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const saved = useMusicStore((s) => s.saved.some((t) => t.id === v.id))
  const toggleSaved = useMusicStore((s) => s.toggleSaved)
  const [shareNote, setShareNote] = useState('')
  const cmd = (func: string) => frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args: [] }), '*')

  // Solo el video que se ve (y el de al lado) tienen su reproductor; los demás, su portada
  useEffect(() => {
    if (!isActive) {
      setUnmuted(false)
      setPaused(false)
    }
  }, [isActive])

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!YT_ORIGIN.test(e.origin) || e.source !== frame.current?.contentWindow) return
      let d: { event?: string; info?: { playerState?: number } | number }
      try {
        d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
      } catch {
        return
      }
      if (d.event === 'onError') setBlocked(true)
      if (typeof d.info === 'object' && typeof d.info?.playerState === 'number') setPaused(d.info.playerState === 2)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const share = async () => {
    const url = withAppParam(`${window.location.origin}/play/${v.id}`)
    try {
      if (navigator.share) await navigator.share({ title: v.title, url })
      else {
        await navigator.clipboard.writeText(url)
        setShareNote('Enlace copiado')
        setTimeout(() => setShareNote(''), 2000)
      }
    } catch {}
  }

  const src = `https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&mute=1&playsinline=1&controls=0&rel=0&modestbranding=1&enablejsapi=1&loop=0&hl=es&origin=${encodeURIComponent(typeof window !== 'undefined' ? window.location.origin : '')}`

  return (
    <section className="relative h-full w-full snap-start snap-always bg-black overflow-hidden" aria-label={v.title}>
      {/* Portada (siempre) y video (solo cerca de la vista) */}
      <div className="absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
        {near && (
          <iframe
            ref={frame}
            key={v.id}
            src={src}
            title={v.title}
            allow="autoplay; encrypted-media; picture-in-picture"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border-0"
            style={{ width: 'max(100vw, 177.78dvh)', height: 'max(100dvh, 56.25vw)', pointerEvents: 'none' }}
            onLoad={() => {
              const w = frame.current?.contentWindow
              w?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*')
            }}
          />
        )}
      </div>

      {/* Tocar: pausa o sigue; el primer toque le da el sonido (los navegadores lo piden) */}
      <button
        className="absolute inset-0 z-10"
        aria-label={paused ? 'Seguir el video' : 'Pausar el video'}
        onClick={() => {
          if (!unmuted && isActive) {
            frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'unMute', args: [] }), '*')
            setUnmuted(true)
          }
          cmd(paused ? 'playVideo' : 'pauseVideo')
        }}
      />
      {paused && isActive && !blocked && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <span className="w-16 h-16 rounded-full bg-black/50 flex items-center justify-center">
            <Headphones className="w-7 h-7" />
          </span>
        </div>
      )}
      {blocked && (
        <div className="absolute inset-x-0 top-1/3 z-10 px-8 text-center">
          <p className="font-semibold">Este video no se puede ver aquí</p>
          <a href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-2 text-violet-300 text-sm underline">
            <ExternalLink className="w-4 h-4" /> Abrir en YouTube
          </a>
        </div>
      )}

      {/* Lado derecho: como YouTube Music */}
      <div className="absolute right-3 bottom-28 z-20 flex flex-col items-center gap-5">
        <Action label={saved ? 'Quitar de tu biblioteca' : 'Guardar en tu biblioteca'} onClick={() => toggleSaved(videoOf(v))} active={saved}>
          <Heart className={`w-6 h-6 ${saved ? 'fill-violet-300 text-violet-300' : ''}`} />
        </Action>
        <Action label="Escuchar solo el audio" onClick={onSong}>
          <Headphones className="w-6 h-6" />
        </Action>
        <Action label="Compartir" onClick={share}>
          <Share2 className="w-6 h-6" />
        </Action>
      </div>
      {shareNote && <p className="absolute right-3 bottom-[260px] z-20 rounded-full bg-black/70 px-3 py-1 text-xs">{shareNote}</p>}

      {/* Abajo: título y canal */}
      <div className="absolute left-0 right-20 bottom-6 z-20 px-4 pointer-events-none">
        <p className="font-bold text-base leading-tight line-clamp-2 drop-shadow">{v.title}</p>
        <p className="text-slate-300 text-sm truncate mt-1 drop-shadow">{v.channel}</p>
      </div>
    </section>
  )
}

function Action({ label, onClick, active = false, children }: { label: string; onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className={`flex flex-col items-center gap-1 text-xs font-semibold drop-shadow ${active ? 'text-violet-300' : 'text-white'}`}>
      <span className="w-12 h-12 rounded-full bg-black/45 backdrop-blur flex items-center justify-center">{children}</span>
    </button>
  )
}

