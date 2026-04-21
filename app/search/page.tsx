import type { Metadata } from 'next'
import { searchMovies } from '@/lib/tmdb'
import MovieGrid from '@/components/MovieGrid'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface SearchPageProps {
  searchParams: { q?: string; page?: string }
}

export async function generateMetadata({ searchParams }: SearchPageProps): Promise<Metadata> {
  const query = searchParams.q || ''
  return {
    title: query ? `Resultados para "${query}"` : 'Búsqueda',
    description: query
      ? `Resultados de búsqueda de películas para "${query}" en CarlosPN Films.`
      : 'Busca tus películas favoritas en CarlosPN Films.',
  }
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const query = searchParams.q?.trim() || ''
  const currentPage = Math.max(1, parseInt(searchParams.page || '1', 10))

  if (!query) {
    return (
      <div className="pt-24 min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
        <svg
          className="w-20 h-20 text-slate-600 mb-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <h1 className="text-3xl font-bold text-white mb-3">Busca una película</h1>
        <p className="text-slate-400 max-w-md">
          Usa la barra de búsqueda del encabezado para encontrar tus películas favoritas.
        </p>
      </div>
    )
  }

  const data = await searchMovies(query, currentPage).catch(() => ({ page: 1, results: [], total_pages: 0, total_results: 0 }))
  const { results, total_pages, total_results } = data
  const hasNextPage = currentPage < total_pages
  const hasPrevPage = currentPage > 1

  return (
    <div className="pt-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-1 h-8 bg-amber-400 rounded-full" />
          <h1 className="text-2xl sm:text-3xl font-bold text-white">
            Resultados para{' '}
            <span className="text-amber-400">
              &ldquo;{query}&rdquo;
            </span>
          </h1>
        </div>
        {total_results > 0 && (
          <p className="text-slate-400 pl-4 text-sm">
            {total_results.toLocaleString('es-ES')} resultados encontrados
            {total_pages > 1 && (
              <span className="ml-1">
                — Página {currentPage} de {total_pages}
              </span>
            )}
          </p>
        )}
      </div>

      <MovieGrid
        movies={results}
        emptyMessage={`No se encontraron películas para "${query}". Intenta con otro término.`}
      />

      {(hasNextPage || hasPrevPage) && (
        <div className="flex items-center justify-center gap-4 mt-12">
          {hasPrevPage && (
            <Link
              href={`/search?q=${encodeURIComponent(query)}&page=${currentPage - 1}`}
              className="inline-flex items-center gap-2 bg-[#1e293b] hover:bg-[#2d3748] text-white font-medium px-5 py-2.5 rounded-full border border-[#2d3748] hover:border-slate-500 transition-all duration-200"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Anterior
            </Link>
          )}

          <span className="text-slate-400 text-sm font-medium">
            {currentPage} / {total_pages}
          </span>

          {hasNextPage && (
            <Link
              href={`/search?q=${encodeURIComponent(query)}&page=${currentPage + 1}`}
              className="inline-flex items-center gap-2 bg-amber-400 hover:bg-amber-300 text-[#0f172a] font-bold px-5 py-2.5 rounded-full transition-all duration-200 hover:scale-105"
            >
              Siguiente
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
