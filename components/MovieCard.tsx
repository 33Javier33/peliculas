import Link from 'next/link'
import Image from 'next/image'
import type { Movie } from '@/types/tmdb'
import { getPosterUrl, formatRating, formatYear } from '@/lib/tmdb'

interface MovieCardProps {
  movie: Movie
}

export default function MovieCard({ movie }: MovieCardProps) {
  const posterUrl = getPosterUrl(movie.poster_path, 'w500')
  const rating = formatRating(movie.vote_average)
  const year = formatYear(movie.release_date)

  const ratingColor =
    movie.vote_average >= 7.5
      ? 'text-emerald-400 border-emerald-400/40 bg-emerald-400/10'
      : movie.vote_average >= 6
        ? 'text-amber-400 border-amber-400/40 bg-amber-400/10'
        : 'text-red-400 border-red-400/40 bg-red-400/10'

  return (
    <Link href={`/movie/${movie.id}`} className="group block">
      <div className="relative overflow-hidden rounded-xl bg-[#1a2236] border border-[#2d3748] transition-all duration-300 group-hover:border-amber-400/50 group-hover:shadow-2xl group-hover:shadow-amber-400/10 group-hover:-translate-y-1">
        <div className="relative aspect-[2/3] overflow-hidden">
          {posterUrl ? (
            <Image
              src={posterUrl}
              alt={`Póster de ${movie.title}`}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-[#1e293b] gap-2">
              <svg
                className="w-12 h-12 text-slate-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1}
                  d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"
                />
              </svg>
              <span className="text-slate-600 text-xs font-medium">Sin imagen</span>
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a]/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div className="bg-amber-400 text-[#0f172a] rounded-full p-3 transform scale-75 group-hover:scale-100 transition-transform duration-300 shadow-lg">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>

          <div
            className={`absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-bold backdrop-blur-sm ${ratingColor}`}
          >
            <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            {rating}
          </div>
        </div>

        <div className="p-3">
          <h3 className="text-white font-semibold text-sm leading-tight line-clamp-2 group-hover:text-amber-400 transition-colors duration-200">
            {movie.title}
          </h3>
          <p className="text-slate-500 text-xs mt-1">{year}</p>
        </div>
      </div>
    </Link>
  )
}
