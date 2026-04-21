import Link from 'next/link'
import Image from 'next/image'
import type { Movie } from '@/types/tmdb'
import { getBackdropUrl, formatRating, formatYear } from '@/lib/tmdb'

interface HeroSectionProps {
  movie: Movie
}

export default function HeroSection({ movie }: HeroSectionProps) {
  const backdropUrl = getBackdropUrl(movie.backdrop_path, 'original')
  const rating = formatRating(movie.vote_average)
  const year = formatYear(movie.release_date)

  return (
    <section className="relative w-full h-[85vh] min-h-[500px] max-h-[800px] overflow-hidden">
      {backdropUrl ? (
        <Image
          src={backdropUrl}
          alt={`Imagen de fondo de ${movie.title}`}
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
          quality={90}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-[#0f172a]" />
      )}

      <div className="absolute inset-0 bg-gradient-to-r from-[#0f172a] via-[#0f172a]/70 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a] via-transparent to-[#0f172a]/20" />

      <div className="absolute inset-0 flex items-end pb-16 md:items-center md:pb-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-4">
              <span className="inline-flex items-center gap-1.5 bg-amber-400/20 border border-amber-400/40 text-amber-400 text-xs font-bold px-3 py-1.5 rounded-full uppercase tracking-wider">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                Tendencia
              </span>
              <span className="text-slate-400 text-sm">{year}</span>
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-6xl font-black text-white leading-tight mb-4 drop-shadow-lg">
              {movie.title}
            </h1>

            <div className="flex items-center gap-4 mb-5">
              <div className="flex items-center gap-1.5">
                <svg
                  className="w-5 h-5 text-amber-400 fill-amber-400"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                <span className="text-white font-bold text-lg">{rating}</span>
                <span className="text-slate-400 text-sm">/ 10</span>
              </div>
              <span className="w-1 h-1 bg-slate-500 rounded-full" />
              <span className="text-slate-300 text-sm">
                {movie.vote_count.toLocaleString('es-ES')} votos
              </span>
            </div>

            {movie.overview && (
              <p className="text-slate-300 text-base sm:text-lg leading-relaxed line-clamp-3 mb-8 drop-shadow">
                {movie.overview}
              </p>
            )}

            <div className="flex flex-wrap gap-3">
              <Link
                href={`/movie/${movie.id}`}
                className="inline-flex items-center gap-2 bg-amber-400 hover:bg-amber-300 text-[#0f172a] font-bold px-6 py-3 rounded-full transition-all duration-200 hover:scale-105 shadow-lg shadow-amber-400/25"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Ver detalles
              </Link>
              <Link
                href={`/movie/${movie.id}`}
                className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white font-semibold px-6 py-3 rounded-full border border-white/20 transition-all duration-200 hover:scale-105"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Más info
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#0f172a] to-transparent" />
    </section>
  )
}
