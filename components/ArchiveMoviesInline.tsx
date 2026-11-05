'use client'

import { useEffect, useState } from 'react'
import { Library } from 'lucide-react'
import type { FreeMovie } from '@/lib/pluto'
import MoviePlayer from '@/components/MoviePlayer'
import { MovieTile } from '@/components/FreeMoviesClient'
import { cachedJson } from '@/lib/client-cache'

// Al buscar en Videos o Películas: primero lo que hay gratis y completo en Internet Archive
// (en español y clásicos), antes que YouTube o el catálogo.
export default function ArchiveMoviesInline({ query, className = '' }: { query: string; className?: string }) {
  const [movies, setMovies] = useState<FreeMovie[] | null>(null)
  const [current, setCurrent] = useState<FreeMovie | null>(null)
  useEffect(() => {
    const q = query.trim()
    setMovies(null)
    if (q.length < 2) return
    let cancelled = false
    const url = (kind: string) => `/api/free-movies?source=archive&kind=${kind}&page=1&q=${encodeURIComponent(q)}`
    Promise.all(['es', 'classic'].map((k) => cachedJson<{ movies?: FreeMovie[] }>(url(k), 6 * 3600_000)))
      .then(([es, classic]) => {
        if (cancelled) return
        const seen = new Set<string>()
        setMovies([...(es?.movies ?? []), ...(classic?.movies ?? [])].filter((m) => !seen.has(m.id) && seen.add(m.id)).slice(0, 24))
      })
      .catch(() => !cancelled && setMovies([]))
    return () => {
      cancelled = true
    }
  }, [query])

  if (!movies?.length) return null
  return (
    <section className={`mb-8 ${className}`}>
      <h3 className="flex items-center gap-1.5 text-slate-400 text-xs font-bold uppercase tracking-[0.08em] font-display mb-3">
        <Library className="w-3.5 h-3.5 text-amber-400" /> Gratis en Internet Archive
      </h3>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">
        {movies.map((m) => (
          <MovieTile key={m.id} movie={m} onSelect={setCurrent} className={m.landscape ? 'shrink-0 w-56' : 'shrink-0 w-32 sm:w-36'} />
        ))}
      </div>
      {current && <MoviePlayer movie={current} onClose={() => setCurrent(null)} />}
    </section>
  )
}
