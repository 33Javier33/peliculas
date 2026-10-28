'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Search, Loader2, AlertCircle, X, Film, Clock, Cast } from 'lucide-react'
import type { FreeMovie, FreeMovieRow } from '@/lib/pluto'
import { useMusicStore } from '@/store/musicStore'
import { readSession, writeSession } from '@/lib/session-cache'
import CastButton, { useIsCasting, useCastStore } from '@/components/CastButton'

// Películas completas, gratis y legales: Pluto TV a la carta e Internet Archive.

type Tab = 'pluto' | 'es' | 'classic'
const TABS: { id: Tab; label: string }[] = [
  { id: 'pluto', label: 'Pluto TV' },
  { id: 'es', label: 'Clásicos en español' },
  { id: 'classic', label: 'Clásicos del cine' },
]

export default function FreeMoviesClient() {
  const [tab, setTab] = useState<Tab>('pluto')
  // La pestaña elegida se recuerda en la sesión (se lee después de dibujar, para no chocar con el HTML del servidor)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const saved = readSession<Tab>('free-tab')
    if (saved && TABS.some((t) => t.id === saved)) setTab(saved)
    setReady(true)
  }, [])
  const [rows, setRows] = useState<FreeMovieRow[]>([])
  const [movies, setMovies] = useState<FreeMovie[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [current, setCurrent] = useState<FreeMovie | null>(null)

  useEffect(() => {
    if (ready) writeSession('free-tab', tab)
  }, [tab, ready])

  // Pluto TV: filas por categoría
  useEffect(() => {
    if (!ready || tab !== 'pluto') return
    let cancelled = false
    setLoading(true)
    setError(false)
    fetch('/api/free-movies?source=pluto')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { rows: FreeMovieRow[] }) => !cancelled && setRows(d.rows))
      .catch(() => !cancelled && (setError(true), setRows([])))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [tab, ready])

  // Internet Archive: cuadrícula con búsqueda y "ver más"
  const loadArchive = useCallback(async (kind: Tab, q: string, p: number) => {
    const params = new URLSearchParams({ source: 'archive', kind, page: String(p) })
    if (q) params.set('q', q)
    const r = await fetch(`/api/free-movies?${params}`)
    if (!r.ok) throw new Error()
    return ((await r.json()) as { movies: FreeMovie[] }).movies
  }, [])

  useEffect(() => {
    if (!ready || tab === 'pluto') return
    let cancelled = false
    setLoading(true)
    setError(false)
    setPage(1)
    loadArchive(tab, submitted, 1)
      .then((list) => {
        if (cancelled) return
        setMovies(list)
        setHasMore(list.length >= 48)
      })
      .catch(() => !cancelled && (setError(true), setMovies([])))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [tab, submitted, loadArchive, ready])

  const more = async () => {
    const next = page + 1
    setPage(next)
    try {
      const list = await loadArchive(tab, submitted, next)
      setMovies((prev) => [...prev, ...list.filter((m) => !prev.some((p) => p.id === m.id))])
      setHasMore(list.length >= 48)
    } catch {
      setHasMore(false)
    }
  }

  const chip = (on: boolean) =>
    `shrink-0 px-4 py-2 rounded-full text-sm font-semibold font-display transition-colors ${
      on ? 'bg-violet-500 text-white shadow-glow' : 'bg-surface-2/60 border border-white/8 text-slate-300 hover:text-white'
    }`

  return (
    <div className="pt-20 min-h-screen bg-obsidian pb-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-1 h-8 bg-violet-500 rounded-full" />
          <h1 className="text-2xl font-bold text-white font-display">Películas gratis</h1>
        </div>
        <p className="text-slate-400 text-sm mb-5">Películas completas, gratis y legales. Sin cuenta.</p>

        <div className="flex gap-2 overflow-x-auto pb-1 mb-4 -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={chip(tab === t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {tab !== 'pluto' && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setSubmitted(query.trim())
            }}
            className="relative mb-6"
          >
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                if (!e.target.value) setSubmitted('')
              }}
              placeholder="Buscar película clásica..."
              aria-label="Buscar película clásica"
              className="w-full bg-surface-1 border border-white/8 text-white placeholder-slate-500 rounded-full pl-12 pr-4 py-3 text-base focus:outline-none focus:border-violet-500"
            />
          </form>
        )}

        {error && (
          <div className="mb-6 flex items-start gap-3 bg-red-950/40 border border-red-900/50 text-red-400 rounded-xl px-5 py-4 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" /> No se pudieron cargar las películas. Intenta de nuevo en un momento.
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
          </div>
        ) : tab === 'pluto' ? (
          <div className="space-y-8">
            {rows.map((row) => (
              <section key={row.name}>
                <h2 className="text-white font-bold text-lg font-display mb-3">{row.name}</h2>
                <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">
                  {row.movies.map((m) => (
                    <MovieTile key={m.id} movie={m} onSelect={setCurrent} className="w-32 sm:w-40 shrink-0" />
                  ))}
                </div>
              </section>
            ))}
            {!error && rows.length === 0 && <p className="text-slate-500 text-center py-20">No hay películas disponibles en tu país ahora.</p>}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {movies.map((m) => (
                <MovieTile key={m.id} movie={m} onSelect={setCurrent} />
              ))}
            </div>
            {!error && movies.length === 0 && <p className="text-slate-500 text-center py-20">No se encontraron películas.</p>}
            {hasMore && (
              <div className="flex justify-center mt-8">
                <button onClick={more} className="px-6 py-3 rounded-full bg-surface-2 border border-white/8 text-white font-semibold">
                  Ver más
                </button>
              </div>
            )}
          </>
        )}

        <p className="text-slate-600 text-xs mt-10">
          Fuentes: Pluto TV (gratis con publicidad) e Internet Archive (películas de dominio público).
        </p>
      </div>

      {current && <MoviePlayer movie={current} onClose={() => setCurrent(null)} />}
    </div>
  )
}

function MovieTile({ movie, onSelect, className = '' }: { movie: FreeMovie; onSelect: (m: FreeMovie) => void; className?: string }) {
  const [failed, setFailed] = useState(false)
  return (
    <button onClick={() => onSelect(movie)} className={`text-left group ${className}`}>
      <div className="aspect-[2/3] rounded-xl overflow-hidden bg-surface-2 border border-white/8 group-hover:border-violet-500/50 flex items-center justify-center">
        {movie.poster && !failed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={movie.poster} alt={movie.title} loading="lazy" onError={() => setFailed(true)} className="w-full h-full object-cover" />
        ) : (
          <Film className="w-8 h-8 text-slate-600" />
        )}
      </div>
      <p className="mt-1.5 text-white text-xs sm:text-sm font-semibold line-clamp-2 leading-snug">{movie.title}</p>
      {movie.year && <p className="text-slate-500 text-[11px]">{movie.year}</p>}
    </button>
  )
}

/** Reproductor a pantalla completa: HLS (Pluto TV) o MP4 (Internet Archive). */
function MoviePlayer({ movie, onClose }: { movie: FreeMovie; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [url, setUrl] = useState(movie.url)
  const [status, setStatus] = useState<'loading' | 'playing' | 'error'>('loading')

  // Las películas del archivo traen la dirección del video al abrirlas
  useEffect(() => {
    setStatus('loading')
    if (movie.url) return setUrl(movie.url)
    const id = movie.id.replace(/^archive-/, '')
    fetch(`/api/free-movies?archive=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { url: string }) => setUrl(d.url))
      .catch(() => setStatus('error'))
  }, [movie])

  // Cerrar con la tecla Escape y bloquear el scroll de fondo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  // Mientras se ve en la TV, el teléfono no la reproduce; al dejar de transmitir sigue desde ese punto
  const casting = useIsCasting()
  const castDevice = useCastStore((s) => s.device)
  const resumeAt = useRef(0)

  useEffect(() => {
    const video = videoRef.current
    if (!video || !url || casting) return
    useMusicStore.getState().setIsPlaying(false)
    let destroyed = false
    const onMeta = () => {
      if (resumeAt.current > 5) video.currentTime = resumeAt.current
    }
    video.addEventListener('loadedmetadata', onMeta, { once: true })
    let triedFallback = false
    let hls: import('hls.js').default | null = null
    const onPlaying = () => setStatus('playing')
    video.addEventListener('playing', onPlaying)

    const start = (src: string) => {
      if (!/m3u8|\/api\/hls/.test(src)) {
        video.src = src
        video.onerror = () => !destroyed && setStatus('error')
        video.play().catch(() => {})
        return
      }
      import('hls.js').then(({ default: Hls }) => {
        if (destroyed) return
        if (!Hls.isSupported()) {
          video.src = src
          video.onerror = () => !destroyed && setStatus('error')
          video.play().catch(() => {})
          return
        }
        hls?.destroy()
        const instance = new Hls({ enableWorker: true, maxBufferLength: 60, capLevelToPlayerSize: true, fragLoadingMaxRetry: 6 })
        hls = instance
        let recoveries = 0
        instance.on(Hls.Events.ERROR, (_e, data) => {
          if (!data.fatal || destroyed) return
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && recoveries++ < 2) instance.recoverMediaError()
          else if (data.type === Hls.ErrorTypes.NETWORK_ERROR && !triedFallback && movie.fallbackUrl) {
            triedFallback = true
            start(movie.fallbackUrl)
          } else setStatus('error')
        })
        instance.loadSource(src)
        instance.attachMedia(video)
        video.play().catch(() => {})
      })
    }
    start(url)

    return () => {
      destroyed = true
      if (video.currentTime > 5) resumeAt.current = video.currentTime
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('loadedmetadata', onMeta)
      video.onerror = null
      hls?.destroy()
      video.removeAttribute('src')
      video.load()
    }
  }, [url, movie.fallbackUrl, casting])

  return (
    <div className="fixed inset-0 z-[110] bg-obsidian overflow-y-auto" role="dialog" aria-label={movie.title}>
      <div className="max-w-5xl mx-auto sm:pt-6">
        <div className="relative aspect-video bg-black sm:rounded-2xl overflow-hidden">
          <video ref={videoRef} controls playsInline autoPlay poster={movie.backdrop} className={`w-full h-full ${casting ? 'invisible' : ''}`} />
          {casting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-violet-950 to-black text-center px-6">
              <Cast className="w-10 h-10 text-emerald-400" />
              <p className="text-white font-semibold">Viendo en {castDevice || 'la TV'}</p>
              <p className="text-slate-400 text-sm">Pausa, adelanta o detén desde el botón de transmitir o la notificación.</p>
            </div>
          )}
          {status === 'loading' && !casting && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <Loader2 className="w-10 h-10 text-violet-300 animate-spin" />
            </div>
          )}
          {status === 'error' && !casting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 text-center px-6">
              <AlertCircle className="w-8 h-8 text-red-400" />
              <p className="text-white font-semibold">Esta película no se pudo cargar</p>
              <p className="text-slate-400 text-sm">Prueba con otra o vuelve a intentarlo más tarde.</p>
            </div>
          )}
        </div>
        <div className="px-4 sm:px-1 py-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-white text-xl font-bold font-display">{movie.title}</h2>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-400 text-sm mt-1">
                {movie.year && <span>{movie.year}</span>}
                {movie.duration ? (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> {movie.duration} min
                  </span>
                ) : null}
                {movie.genre && <span>{movie.genre}</span>}
                {movie.rating && <span className="px-1.5 rounded border border-white/20 text-xs">{movie.rating}</span>}
              </p>
            </div>
            {url && <CastButton videoRef={videoRef} media={{ url, altUrl: movie.fallbackUrl, title: movie.title, poster: movie.poster }} />}
            <button
              onClick={onClose}
              className="shrink-0 w-10 h-10 rounded-full bg-surface-2 border border-white/8 flex items-center justify-center text-slate-300"
              aria-label="Cerrar película"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          {movie.summary && <p className="text-slate-300 text-sm leading-relaxed mt-3">{movie.summary}</p>}
        </div>
      </div>
    </div>
  )
}
