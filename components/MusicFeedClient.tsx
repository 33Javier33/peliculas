'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, Heart, Share2, Headphones, Loader2, ExternalLink } from 'lucide-react'
import { useMusicStore } from '@/store/musicStore'
import { useMyArtists, artistVideoRows, videoOf, type V } from '@/lib/music-videos-data'
import { withAppParam } from '@/lib/app-flavor'
import { getNative } from '@/lib/native'

// Videos para ti, en la barra de menú: a pantalla completa y en vertical (como YouTube Music), con los
// videos de tus artistas y de los parecidos. El que se ve suena; al terminar pasa solo al siguiente.
// A los 6 s del video que se ve, el siguiente ya queda cargado (en la app también se prepara su audio).

const YT_ORIGIN = /^https:\/\/(www\.)?youtube(-nocookie)?\.com$/
const PRELOAD_AT = 6 // segundos del video que se ve para preparar el siguiente

/** ¿El navegador ya dejó sonar la página (hubo un toque o clic)? Entonces el video puede arrancar con sonido */
const canSound = () => typeof navigator !== 'undefined' && !!(navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive

export default function MusicFeedClient() {
  const router = useRouter()
  const mine = useMyArtists()
  const [videos, setVideos] = useState<V[]>([])
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState(0)
  // Hasta qué video está permitido cargar (el siguiente se habilita a los 6 s del que se ve)
  const [preloaded, setPreloaded] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)

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

  const goTo = useCallback((i: number) => {
    const el = boxRef.current
    if (!el || i < 0 || i >= videos.length) return
    el.scrollTo({ top: i * el.clientHeight, behavior: 'smooth' })
  }, [videos.length])

  const onAt = useCallback((i: number, t: number) => {
    if (t < PRELOAD_AT) return
    setPreloaded((p) => Math.max(p, Math.min(i + 1, videos.length - 1)))
    // En la app se prepara también el audio del siguiente (queda en el caché del teléfono)
    if (i + 1 < videos.length) {
      const n = getNative() as unknown as { prefetch?: (id: string) => void } | null
      n?.prefetch?.(videos[i + 1].id)
    }
  }, [videos])

  return (
    <div className="fixed inset-x-0 top-0 bottom-14 sm:bottom-0 z-[84] bg-black text-white">
      <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
        <p className="font-bold text-sm">Videos para ti</p>
        <Link href="/music/videos" className="pointer-events-auto w-10 h-10 rounded-full bg-black/50 flex items-center justify-center" aria-label="Buscar videos y géneros">
          <Search className="w-5 h-5" />
        </Link>
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
          <Link href="/music/videos" className="mt-2 text-violet-300 underline text-sm">Buscar videos</Link>
        </div>
      )}

      <div
        ref={boxRef}
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
            isActive={i === active}
            // Se monta el que se ve y el siguiente cuando ya se llegó a los 6 s
            mounted={i === active || (i === active + 1 && preloaded >= i)}
            onAt={(t) => onAt(i, t)}
            onEnded={() => goTo(i + 1)}
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

function FeedItem({
  v,
  isActive,
  mounted,
  onAt,
  onEnded,
  onSong,
}: {
  v: V
  isActive: boolean
  mounted: boolean
  onAt: (t: number) => void
  onEnded: () => void
  onSong: () => void
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [loaded, setLoaded] = useState(false)
  const [paused, setPaused] = useState(false)
  const [blocked, setBlocked] = useState(false)
  // Con sonido si el navegador ya lo permite (hubo un toque antes en la página)
  const sound = useRef(canSound())
  const saved = useMusicStore((s) => s.saved.some((t) => t.id === v.id))
  const toggleSaved = useMusicStore((s) => s.toggleSaved)
  const [shareNote, setShareNote] = useState('')
  // Callbacks al día sin reconectar el mensaje de YouTube
  const cb = useRef({ onAt, onEnded, isActive })
  cb.current = { onAt, onEnded, isActive }

  const post = (func: string, args: unknown[] = []) => frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*')

  // Al ser el que se ve: suena y arranca (con sonido si ya se permite). El reproductor a veces ignora
  // una orden que llega antes de estar listo: se repite hasta que confirme que está sonando
  const playing = useRef(false)
  useEffect(() => {
    if (!isActive || !loaded) return
    playing.current = false
    setPaused(false)
    let tries = 0
    const go = () => {
      if (playing.current || tries++ > 20) return clearInterval(iv)
      if (sound.current || canSound()) {
        sound.current = true
        post('unMute')
      }
      post('playVideo')
    }
    const iv = setInterval(go, 500)
    go()
    return () => clearInterval(iv)
  }, [isActive, loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!YT_ORIGIN.test(e.origin) || e.source !== frame.current?.contentWindow) return
      let d: { event?: string; info?: { playerState?: number; currentTime?: number } | number }
      try {
        d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
      } catch {
        return
      }
      if (d.event === 'onError') return setBlocked(true)
      if (d.event !== 'infoDelivery' || typeof d.info !== 'object' || !d.info) return
      const { playerState, currentTime } = d.info
      if (!cb.current.isActive) return
      if (typeof currentTime === 'number') cb.current.onAt(currentTime)
      if (playerState === 1) playing.current = true
      if (playerState === 2) setPaused(true)
      if (playerState === 1) setPaused(false)
      if (playerState === 0) cb.current.onEnded()
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // El primer toque en la página da el permiso de sonido: a partir de ahí todos suenan
  const unlock = () => {
    sound.current = true
  }

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

  // Se decide al abrir el reproductor de este video (si ya hubo un toque, arranca con sonido)
  const src = useMemo(() => {
    const withSound = sound.current || canSound()
    if (withSound) sound.current = true
    return `https://www.youtube-nocookie.com/embed/${v.id}?enablejsapi=1&autoplay=0&playsinline=1&controls=0&rel=0&modestbranding=1&hl=es${withSound ? '' : '&mute=1'}&origin=${encodeURIComponent(typeof window !== 'undefined' ? window.location.origin : '')}`
  }, [mounted, v.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="relative h-full w-full snap-start snap-always bg-black overflow-hidden" aria-label={v.title} onPointerDownCapture={unlock}>
      <div className="absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
        {mounted && (
          <iframe
            ref={frame}
            key={v.id}
            src={src}
            title={v.title}
            allow="autoplay; encrypted-media; picture-in-picture"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border-0"
            style={{ width: 'max(100vw, 177.78dvh)', height: 'max(100dvh, 56.25vw)', pointerEvents: 'none' }}
            onLoad={() => {
              setLoaded(true)
              frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*')
            }}
          />
        )}
      </div>

      {/* Tocar: pausa o sigue */}
      <button
        className="absolute inset-0 z-10"
        aria-label={paused ? 'Seguir el video' : 'Pausar el video'}
        onClick={() => {
          unlock()
          post(paused ? 'playVideo' : 'pauseVideo')
          setPaused(!paused)
        }}
      />
      {paused && isActive && !blocked && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <span className="w-16 h-16 rounded-full bg-black/50 flex items-center justify-center">
            <Headphones className="w-7 h-7" />
          </span>
        </div>
      )}
      {!loaded && mounted && !blocked && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <Loader2 className="w-7 h-7 animate-spin text-white/80" />
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
