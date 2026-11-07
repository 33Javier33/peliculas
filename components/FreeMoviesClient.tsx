'use client'

import HelpTip from '@/components/HelpTip'

import { useCallback, useEffect, useState } from 'react'
import { Search, Loader2, AlertCircle, Film, CheckCircle2, Download, Trash2, X } from 'lucide-react'
import type { FreeMovie, FreeMovieRow } from '@/lib/pluto'
import { ARCHIVE_GENRES } from '@/lib/archive'
import { readSession, writeSession } from '@/lib/session-cache'
import { formatSize } from '@/lib/offline-files'
import { useMovieStore } from '@/store/movieStore'
import MoviePlayer from '@/components/MoviePlayer'
import { useSearchSuggestions } from '@/components/SearchSuggestions'

// Películas completas, gratis y legales: en español y clásicos de dominio público (Internet
// Archive y Wikimedia Commons), Pluto TV a la carta y "Mis películas" (seguir viendo y descargadas).

type Tab = 'es' | 'classic' | 'pluto' | 'saved'
const TABS: { id: Tab; label: string }[] = [
  { id: 'es', label: 'En español' },
  { id: 'classic', label: 'Clásicos' },
  { id: 'pluto', label: 'Pluto TV' },
  { id: 'saved', label: 'Mis películas' },
]
type Sort = 'popular' | 'new' | 'old'
const SORTS: { id: Sort; label: string }[] = [
  { id: 'popular', label: 'Más vistas' },
  { id: 'old', label: 'Más antiguas' },
  { id: 'new', label: 'Más recientes' },
]
const PAGE = 48

interface Saved {
  tab: Tab
  genre: string
  sort: Sort
  submitted: string
}

export default function FreeMoviesClient() {
  const [tab, setTab] = useState<Tab>('es')
  const [genre, setGenre] = useState('')
  const [sort, setSort] = useState<Sort>('popular')
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  // Lo elegido se recuerda en la sesión (se lee después de dibujar, para no chocar con el HTML del servidor)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const s = readSession<Saved>('free-movies')
    const fromUrl = new URLSearchParams(window.location.search).get('tab') as Tab | null
    const t = fromUrl && TABS.some((x) => x.id === fromUrl) ? fromUrl : s?.tab
    if (t && TABS.some((x) => x.id === t)) setTab(t)
    if (s) {
      if (s.genre && ARCHIVE_GENRES[s.genre]) setGenre(s.genre)
      if (SORTS.some((x) => x.id === s.sort)) setSort(s.sort)
      if (s.submitted) {
        setSubmitted(s.submitted)
        setQuery(s.submitted)
      }
    }
    setReady(true)
  }, [])
  useEffect(() => {
    if (ready) writeSession<Saved>('free-movies', { tab, genre, sort, submitted })
  }, [tab, genre, sort, submitted, ready])

  const [rows, setRows] = useState<FreeMovieRow[]>([])
  const [movies, setMovies] = useState<FreeMovie[]>([])
  const [commons, setCommons] = useState<FreeMovie[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [more, setMore] = useState(false)
  const [error, setError] = useState(false)
  const [current, setCurrent] = useState<FreeMovie | null>(null)
  // Autocompletado: títulos y directores del mismo catálogo (en español o clásicos)
  const suggestions = useSearchSuggestions({
    kind: 'freemovies',
    params: `tab=${tab === 'classic' ? 'classic' : 'es'}`,
    value: query,
    onChange: setQuery,
    onPick: (s) => {
      setQuery(s)
      setSubmitted(s)
    },
  })
  const catalog = tab === 'es' || tab === 'classic'

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

  // Internet Archive: cuadrícula con búsqueda, género, orden y "ver más"
  const loadArchive = useCallback(async (p: number) => {
    const params = new URLSearchParams({ source: 'archive', kind: tab, page: String(p), sort })
    if (submitted) params.set('q', submitted)
    if (genre) params.set('genre', genre)
    const r = await fetch(`/api/free-movies?${params}`)
    if (!r.ok) throw new Error()
    return ((await r.json()) as { movies: FreeMovie[] }).movies
  }, [tab, sort, submitted, genre])

  useEffect(() => {
    if (!ready || !catalog) return
    let cancelled = false
    setLoading(true)
    setError(false)
    setPage(1)
    setMovies([])
    loadArchive(1)
      .then((list) => {
        if (cancelled) return
        setMovies(list)
        setHasMore(list.length >= PAGE)
      })
      .catch(() => !cancelled && (setError(true), setMovies([])))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [loadArchive, ready, catalog])

  // Wikimedia Commons: películas restauradas (fila arriba, sin filtro de género)
  useEffect(() => {
    if (!ready || !catalog || genre) return setCommons([])
    let cancelled = false
    const params = new URLSearchParams({ source: 'commons', kind: tab })
    if (submitted) params.set('q', submitted)
    fetch(`/api/free-movies?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { movies: FreeMovie[] }) => !cancelled && setCommons(d.movies))
      .catch(() => !cancelled && setCommons([]))
    return () => {
      cancelled = true
    }
  }, [tab, submitted, genre, ready, catalog])

  const loadMore = async () => {
    const next = page + 1
    setMore(true)
    try {
      const list = await loadArchive(next)
      setPage(next)
      setMovies((prev) => [...prev, ...list.filter((m) => !prev.some((p) => p.id === m.id))])
      setHasMore(list.length >= PAGE)
    } catch {
      setHasMore(false)
    } finally {
      setMore(false)
    }
  }

  const watching = useMovieStore((s) => s.watching)
  const continueList = Object.values(watching)
    .sort((a, b) => b.at - a.at)
    .filter((w) => tab !== 'es' || w.movie.spanish)

  const chip = (on: boolean) =>
    `shrink-0 px-4 py-2 rounded-full text-sm font-semibold font-display transition-colors ${
      on ? 'bg-violet-500 text-white shadow-glow' : 'bg-surface-2/60 border border-white/8 text-slate-300 hover:text-white'
    }`
  const smallChip = (on: boolean) =>
    `shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
      on ? 'bg-white text-obsidian' : 'bg-surface-2/60 border border-white/8 text-slate-300 hover:text-white'
    }`

  return (
    <div className="pt-20 min-h-screen bg-obsidian pb-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-1 h-8 bg-violet-500 rounded-full" />
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white font-display">Películas gratis <HelpTip title="Películas gratis" text="Películas completas y legales: cine de dominio público (Internet Archive) y Pluto TV. «Mis películas» guarda las que marcas o descargas para ver después." /></h1>
        </div>
        <p className="text-slate-400 text-sm mb-5">Películas completas, gratis y legales: cine de dominio público y Pluto TV. Sin cuenta.</p>

        <div className="flex gap-2 overflow-x-auto pb-1 mb-4 -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={chip(tab === t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {catalog && (
          <>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                setSubmitted(query.trim())
              }}
              className="relative mb-3"
            >
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  if (!e.target.value) setSubmitted('')
                }}
                placeholder={tab === 'es' ? 'Buscar película en español…' : 'Buscar película, director o actor…'}
                aria-label="Buscar película"
                enterKeyHint="search"
                className="w-full bg-surface-1 border border-white/8 text-white placeholder-slate-500 rounded-full pl-12 pr-4 py-3 text-base focus:outline-none focus:border-violet-500"
                {...suggestions.inputProps}
              />
              {suggestions.dropdown}
            </form>
            <div className="flex gap-2 overflow-x-auto pb-1 mb-2 -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">
              <button onClick={() => setGenre('')} className={smallChip(!genre)}>
                Todos
              </button>
              {Object.entries(ARCHIVE_GENRES).map(([id, g]) => (
                <button key={id} onClick={() => setGenre(id)} className={smallChip(genre === id)}>
                  {g.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 mb-6 text-xs text-slate-400">
              <span>Ordenar:</span>
              {SORTS.map((s) => (
                <button key={s.id} onClick={() => setSort(s.id)} className={`px-2 py-1 rounded-md ${sort === s.id ? 'text-white bg-white/10 font-semibold' : 'hover:text-white'}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </>
        )}

        {error && (
          <div className="mb-6 flex items-start gap-3 bg-red-950/40 border border-red-900/50 text-red-400 rounded-xl px-5 py-4 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" /> No se pudieron cargar las películas. Intenta de nuevo en un momento.
          </div>
        )}

        {tab === 'saved' ? (
          <SavedMovies onSelect={setCurrent} />
        ) : (
          <>
            {catalog && !submitted && continueList.length > 0 && (
              <Row title="Seguir viendo">
                {continueList.map((w) => (
                  <MovieTile key={w.movie.id} movie={w.movie} onSelect={setCurrent} progress={w.t / w.dur} className="w-32 sm:w-40 shrink-0" />
                ))}
              </Row>
            )}
            {catalog && commons.length > 0 && (
              <Row title={tab === 'es' ? 'Cine latino e hispano restaurado' : 'Joyas restauradas'} note="Wikimedia Commons">
                {commons.map((m) => (
                  <MovieTile key={m.id} movie={m} onSelect={setCurrent} className="w-52 sm:w-64 shrink-0" />
                ))}
              </Row>
            )}

            {loading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
              </div>
            ) : tab === 'pluto' ? (
              <div className="space-y-8">
                {rows.map((row) => (
                  <Row key={row.name} title={row.name}>
                    {row.movies.map((m) => (
                      <MovieTile key={m.id} movie={m} onSelect={setCurrent} className="w-32 sm:w-40 shrink-0" />
                    ))}
                  </Row>
                ))}
                {!error && rows.length === 0 && <p className="text-slate-500 text-center py-20">No hay películas disponibles en tu país ahora.</p>}
              </div>
            ) : (
              <>
                {movies.length > 0 && (
                  <h2 className="text-white font-bold text-lg font-display mb-3">
                    {submitted ? `Resultados para "${submitted}"` : genre ? ARCHIVE_GENRES[genre].label : tab === 'es' ? 'Películas en español' : 'Clásicos del cine'}
                    <span className="ml-2 text-xs font-normal text-slate-500">Internet Archive</span>
                  </h2>
                )}
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                  {movies.map((m) => (
                    <MovieTile key={m.id} movie={m} onSelect={setCurrent} />
                  ))}
                </div>
                {!error && movies.length === 0 && commons.length === 0 && <p className="text-slate-500 text-center py-20">No se encontraron películas.</p>}
                {hasMore && (
                  <div className="flex justify-center mt-8">
                    <button onClick={loadMore} disabled={more} className="px-6 py-3 rounded-full bg-surface-2 border border-white/8 text-white font-semibold flex items-center gap-2">
                      {more && <Loader2 className="w-4 h-4 animate-spin" />} Ver más
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        <p className="text-slate-600 text-xs mt-10">
          Fuentes: Internet Archive y Wikimedia Commons (películas de dominio público o con licencia libre) y Pluto TV (gratis con publicidad).
        </p>
      </div>

      {current && <MoviePlayer movie={current} onClose={() => setCurrent(null)} />}
    </div>
  )
}

function Row({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-white font-bold text-lg font-display mb-3">
        {title}
        {note && <span className="ml-2 text-xs font-normal text-slate-500">{note}</span>}
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">{children}</div>
    </section>
  )
}

export function MovieTile({ movie, onSelect, className = '', progress }: { movie: FreeMovie; onSelect: (m: FreeMovie) => void; className?: string; progress?: number }) {
  const [failed, setFailed] = useState(false)
  const downloaded = useMovieStore((s) => !!s.downloads[movie.id]?.done)
  return (
    <button onClick={() => onSelect(movie)} className={`text-left group ${className}`}>
      <div
        className={`relative ${movie.landscape ? 'aspect-video' : 'aspect-[2/3]'} rounded-xl overflow-hidden bg-surface-2 border border-white/8 group-hover:border-violet-500/50 flex items-center justify-center`}
      >
        {movie.poster && !failed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={movie.poster} alt={movie.title} loading="lazy" onError={() => setFailed(true)} className="w-full h-full object-cover" />
        ) : (
          <Film className="w-8 h-8 text-slate-600" />
        )}
        <div className="absolute top-1.5 left-1.5 flex gap-1">
          {movie.spanish && <span className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">ES</span>}
        </div>
        {downloaded && (
          <span className="absolute top-1.5 right-1.5 rounded-full bg-black/70 p-0.5" title="Descargada">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </span>
        )}
        {movie.landscape && movie.duration ? (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">{movie.duration} min</span>
        ) : null}
        {progress !== undefined && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
            <div className="h-full bg-violet-500" style={{ width: `${Math.round(Math.min(1, progress) * 100)}%` }} />
          </div>
        )}
      </div>
      <p className="mt-1.5 text-white text-xs sm:text-sm font-semibold line-clamp-2 leading-snug">{movie.title}</p>
      {movie.year && <p className="text-slate-500 text-[11px]">{movie.year}</p>}
    </button>
  )
}

/** "Mis películas": seguir viendo y películas descargadas en el teléfono */
function SavedMovies({ onSelect }: { onSelect: (m: FreeMovie) => void }) {
  const watching = useMovieStore((s) => s.watching)
  const downloads = useMovieStore((s) => s.downloads)
  const active = useMovieStore((s) => s.active)
  const list = Object.values(watching).sort((a, b) => b.at - a.at)
  const saved = Object.values(downloads).sort((a, b) => b.savedAt - a.savedAt)
  const total = saved.reduce((n, d) => n + (d.size || 0), 0)

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-white font-bold text-lg font-display mb-3">Seguir viendo</h2>
        {list.length === 0 ? (
          <p className="text-slate-500 text-sm">Las películas que empieces a ver aparecen aquí para seguir donde quedaste.</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {list.map((w) => (
              <div key={w.movie.id} className="relative">
                <MovieTile movie={{ ...w.movie, landscape: false }} onSelect={onSelect} progress={w.t / w.dur} />
                <button
                  onClick={() => useMovieStore.getState().forget(w.movie.id)}
                  className="absolute top-1 right-1 rounded-full bg-black/70 p-1 text-slate-300"
                  aria-label={`Quitar "${w.movie.title}" de seguir viendo`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-white font-bold text-lg font-display mb-1">Descargadas</h2>
        <p className="text-slate-500 text-xs mb-3">
          {saved.length ? `${saved.length} ${saved.length === 1 ? 'película' : 'películas'} · ${formatSize(total)} en el teléfono · se ven sin internet` : 'Abre una película y toca "Descargar para ver sin internet".'}
        </p>
        <div className="space-y-2">
          {saved.map((d) => {
            const pct = active[d.movie.id]
            return (
              <div key={d.movie.id} className="flex items-center gap-3 rounded-xl bg-surface-1 border border-white/8 p-2">
                <button onClick={() => onSelect(d.movie)} className="flex items-center gap-3 min-w-0 flex-1 text-left">
                  <div className="w-12 h-16 shrink-0 rounded-lg overflow-hidden bg-surface-2">
                    {d.movie.poster && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={d.movie.poster} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-white text-sm font-semibold truncate">{d.movie.title}</p>
                    <p className="text-xs text-slate-400">
                      {d.done ? (
                        <span className="text-emerald-400">Descargada · {formatSize(d.size)}</span>
                      ) : pct !== undefined ? (
                        `Descargando ${Math.round(pct * 100)}%`
                      ) : (
                        `En pausa · ${d.total ? Math.round((d.size / d.total) * 100) : 0}% (sigue al volver la conexión)`
                      )}
                    </p>
                  </div>
                </button>
                {!d.done && pct === undefined && (
                  <button onClick={() => useMovieStore.getState().download(d.movie, d.url)} className="p-2 text-violet-300" aria-label="Continuar descarga">
                    <Download className="w-5 h-5" />
                  </button>
                )}
                <button
                  onClick={() => confirm(`¿Borrar "${d.movie.title}" del teléfono?`) && useMovieStore.getState().remove(d.movie.id)}
                  className="p-2 text-slate-400 hover:text-red-400"
                  aria-label={`Borrar "${d.movie.title}"`}
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
