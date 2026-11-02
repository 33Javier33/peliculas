'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Clapperboard } from 'lucide-react'
import type { FreeMovie, FreeMovieRow } from '@/lib/pluto'
import MoviePlayer from '@/components/MoviePlayer'
import { MovieTile } from '@/components/FreeMoviesClient'

// Inicio: películas completas que se ven DENTRO de la app (dominio público de Internet Archive y
// Wikimedia Commons, y Pluto TV a la carta). Reemplaza al catálogo de tendencias, que solo
// mostraba fichas sin poder ver la película.

interface Row {
  key: string
  title: string
  href: string
  movies: FreeMovie[]
}

const get = (q: string) =>
  fetch(`/api/free-movies?${q}`)
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .catch(() => null)

export default function FreeMoviesHome() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [current, setCurrent] = useState<FreeMovie | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      get('source=commons&kind=es'),
      get('source=archive&kind=es&sort=popular&page=1'),
      get('source=archive&kind=classic&sort=popular&page=1'),
      get('source=pluto'),
    ]).then(([commons, es, classic, pluto]) => {
      if (cancelled) return
      const list: Row[] = [
        { key: 'commons', title: 'Cine en español restaurado', href: '/peliculas?tab=es', movies: commons?.movies ?? [] },
        { key: 'es', title: 'En español', href: '/peliculas?tab=es', movies: es?.movies ?? [] },
        { key: 'classic', title: 'Clásicos del cine', href: '/peliculas?tab=classic', movies: classic?.movies ?? [] },
        ...((pluto?.rows ?? []) as FreeMovieRow[]).slice(0, 2).map((r, i) => ({
          key: `pluto-${i}`,
          title: `Pluto TV · ${r.name}`,
          href: '/peliculas?tab=pluto',
          movies: r.movies,
        })),
      ]
      setRows(list.map((r) => ({ ...r, movies: r.movies.slice(0, 16) })).filter((r) => r.movies.length > 0))
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (rows && rows.length === 0) return null

  return (
    <section aria-label="Películas gratis completas">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-1 h-8 bg-violet-500 rounded-full" />
        <h2 className="text-2xl font-bold text-white">Películas gratis para ver aquí</h2>
      </div>
      <p className="text-slate-400 text-sm mb-6">Completas, legales y sin salir de la app.</p>

      {!rows ? (
        <div className="flex gap-3 overflow-hidden" aria-hidden>
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="w-32 shrink-0 aspect-[2/3] rounded-xl bg-surface-1 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {rows.map((row) => (
            <div key={row.key}>
              <div className="flex items-center mb-3">
                <h3 className="text-white font-bold">{row.title}</h3>
                <Link href={row.href} className="ml-auto inline-flex items-center gap-0.5 text-xs text-violet-300 font-semibold">
                  Ver todas <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x">
                {row.movies.map((m) => (
                  <MovieTile key={m.id} movie={m} onSelect={setCurrent} className={`${m.landscape ? 'w-56' : 'w-32'} shrink-0 snap-start`} />
                ))}
              </div>
            </div>
          ))}
          <Link
            href="/peliculas"
            className="inline-flex items-center gap-2 rounded-full bg-violet-500 text-white text-sm font-semibold px-4 py-2"
          >
            <Clapperboard className="w-4 h-4" /> Todas las películas gratis
          </Link>
        </div>
      )}
      {current && <MoviePlayer movie={current} onClose={() => setCurrent(null)} />}
    </section>
  )
}
