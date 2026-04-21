import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  getMovieDetails,
  getMovieVideos,
  getMovieCredits,
  getYouTubeTrailerId,
  getPosterUrl,
  getBackdropUrl,
  getProfileUrl,
  formatRating,
  formatYear,
  formatRuntime,
  formatCurrency,
} from '@/lib/tmdb'

interface MoviePageProps {
  params: { id: string }
}

export async function generateMetadata({ params }: MoviePageProps): Promise<Metadata> {
  try {
    const movie = await getMovieDetails(params.id)
    const posterUrl = getPosterUrl(movie.poster_path, 'w500')
    return {
      title: movie.title,
      description:
        movie.overview?.slice(0, 160) ||
        `Detalles, reparto y trailer de ${movie.title} en CarlosPN Films.`,
      openGraph: {
        title: movie.title,
        description: movie.overview?.slice(0, 160) || '',
        images: posterUrl ? [{ url: posterUrl }] : [],
        type: 'video.movie',
      },
    }
  } catch {
    return { title: 'Película no encontrada' }
  }
}

export default async function MovieDetailPage({ params }: MoviePageProps) {
  const movieId = parseInt(params.id, 10)

  if (isNaN(movieId) || movieId <= 0) {
    notFound()
  }

  const [movie, videosData, creditsData] = await Promise.allSettled([
    getMovieDetails(movieId),
    getMovieVideos(movieId),
    getMovieCredits(movieId),
  ])

  if (movie.status === 'rejected') {
    const err = movie.reason as Error
    if (err.message?.includes('no encontrado') || err.message?.includes('404')) {
      notFound()
    }
    throw err
  }

  const movieData = movie.value
  const videos = videosData.status === 'fulfilled' ? videosData.value.results : []
  const cast = creditsData.status === 'fulfilled' ? creditsData.value.cast.slice(0, 12) : []
  const crew = creditsData.status === 'fulfilled' ? creditsData.value.crew : []

  const trailerId = getYouTubeTrailerId(videos)
  const backdropUrl = getBackdropUrl(movieData.backdrop_path, 'original')
  const posterUrl = getPosterUrl(movieData.poster_path, 'w500')
  const rating = formatRating(movieData.vote_average)
  const year = formatYear(movieData.release_date)
  const runtime = formatRuntime(movieData.runtime)

  const director = crew.find((c) => c.job === 'Director')
  const writers = crew.filter((c) => ['Screenplay', 'Writer', 'Story'].includes(c.job)).slice(0, 3)

  const ratingColor =
    movieData.vote_average >= 7.5
      ? 'text-emerald-400 border-emerald-400/40 bg-emerald-400/10'
      : movieData.vote_average >= 6
        ? 'text-amber-400 border-amber-400/40 bg-amber-400/10'
        : 'text-red-400 border-red-400/40 bg-red-400/10'

  return (
    <div className="min-h-screen">
      <div className="relative w-full h-[50vh] sm:h-[60vh] lg:h-[70vh] overflow-hidden">
        {backdropUrl ? (
          <Image
            src={backdropUrl}
            alt={`Imagen de fondo de ${movieData.title}`}
            fill
            priority
            sizes="100vw"
            className="object-cover object-center"
            quality={85}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-[#0f172a]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a] via-[#0f172a]/30 to-[#0f172a]/50" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0f172a]/60 to-transparent" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-48 sm:-mt-56 lg:-mt-64 relative z-10 pb-20">
        <div className="flex flex-col md:flex-row gap-8 lg:gap-12">
          <div className="shrink-0 w-44 sm:w-52 md:w-60 lg:w-72 mx-auto md:mx-0">
            <div className="relative aspect-[2/3] rounded-2xl overflow-hidden shadow-2xl shadow-black/60 border-2 border-[#2d3748]">
              {posterUrl ? (
                <Image
                  src={posterUrl}
                  alt={`Póster de ${movieData.title}`}
                  fill
                  sizes="(max-width: 768px) 176px, (max-width: 1024px) 208px, 288px"
                  className="object-cover"
                  priority
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-[#1e293b] gap-3">
                  <svg
                    className="w-14 h-14 text-slate-600"
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
                  <span className="text-slate-600 text-sm font-medium">Sin póster</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 pt-2">
            <div className="mb-1">
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-slate-400 hover:text-amber-400 text-sm transition-colors duration-200 mb-4"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                Volver al catálogo
              </Link>
            </div>

            {movieData.tagline && (
              <p className="text-amber-400 text-sm italic font-medium mb-2">
                &ldquo;{movieData.tagline}&rdquo;
              </p>
            )}

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white leading-tight mb-3">
              {movieData.title}
            </h1>

            {movieData.original_title !== movieData.title && (
              <p className="text-slate-500 text-sm mb-3">
                Título original: {movieData.original_title}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3 mb-5">
              <div
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-bold ${ratingColor}`}
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                {rating}
                <span className="text-xs font-normal opacity-70">/ 10</span>
              </div>

              <span className="text-slate-400 text-sm">
                {movieData.vote_count.toLocaleString('es-ES')} votos
              </span>

              <span className="w-1 h-1 bg-slate-600 rounded-full" />
              <span className="text-slate-300 text-sm font-medium">{year}</span>

              {runtime !== 'N/A' && (
                <>
                  <span className="w-1 h-1 bg-slate-600 rounded-full" />
                  <span className="text-slate-300 text-sm">{runtime}</span>
                </>
              )}
            </div>

            {movieData.genres.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {movieData.genres.map((genre) => (
                  <span
                    key={genre.id}
                    className="text-xs font-medium px-3 py-1 bg-[#1e293b] border border-[#2d3748] text-slate-300 rounded-full hover:border-amber-400/50 hover:text-amber-400 transition-colors duration-200 cursor-default"
                  >
                    {genre.name}
                  </span>
                ))}
              </div>
            )}

            {movieData.overview && (
              <div className="mb-6">
                <h2 className="text-white font-semibold text-sm uppercase tracking-wider mb-2 flex items-center gap-2">
                  <div className="w-0.5 h-4 bg-amber-400 rounded-full" />
                  Sinopsis
                </h2>
                <p className="text-slate-300 leading-relaxed text-base">{movieData.overview}</p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              {director && (
                <div>
                  <span className="text-slate-500 text-xs uppercase tracking-wider">Director</span>
                  <p className="text-white font-medium text-sm mt-0.5">{director.name}</p>
                </div>
              )}
              {writers.length > 0 && (
                <div>
                  <span className="text-slate-500 text-xs uppercase tracking-wider">Guion</span>
                  <p className="text-white font-medium text-sm mt-0.5">
                    {writers.map((w) => w.name).join(', ')}
                  </p>
                </div>
              )}
              {movieData.status && (
                <div>
                  <span className="text-slate-500 text-xs uppercase tracking-wider">Estado</span>
                  <p className="text-white font-medium text-sm mt-0.5">{movieData.status}</p>
                </div>
              )}
              {movieData.release_date && (
                <div>
                  <span className="text-slate-500 text-xs uppercase tracking-wider">
                    Estreno
                  </span>
                  <p className="text-white font-medium text-sm mt-0.5">
                    {new Date(movieData.release_date).toLocaleDateString('es-ES', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                </div>
              )}
              {movieData.budget > 0 && (
                <div>
                  <span className="text-slate-500 text-xs uppercase tracking-wider">
                    Presupuesto
                  </span>
                  <p className="text-white font-medium text-sm mt-0.5">
                    {formatCurrency(movieData.budget)}
                  </p>
                </div>
              )}
              {movieData.revenue > 0 && (
                <div>
                  <span className="text-slate-500 text-xs uppercase tracking-wider">
                    Recaudación
                  </span>
                  <p className="text-emerald-400 font-medium text-sm mt-0.5">
                    {formatCurrency(movieData.revenue)}
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              {trailerId && (
                <a
                  href={`#trailer`}
                  className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white font-bold px-5 py-2.5 rounded-full transition-all duration-200 hover:scale-105 shadow-lg shadow-red-600/25"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M23.495 6.205a3.007 3.007 0 00-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 00.527 6.205a31.247 31.247 0 00-.522 5.805 31.247 31.247 0 00.522 5.783 3.007 3.007 0 002.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 002.088-2.088 31.247 31.247 0 00.5-5.783 31.247 31.247 0 00-.5-5.805zM9.609 15.601V8.408l6.264 3.602z" />
                  </svg>
                  Ver Trailer
                </a>
              )}
              {movieData.homepage && (
                <a
                  href={movieData.homepage}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-[#1e293b] hover:bg-[#2d3748] text-white font-medium px-5 py-2.5 rounded-full border border-[#2d3748] hover:border-slate-500 transition-all duration-200"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                  Sitio oficial
                </a>
              )}
              {movieData.imdb_id && (
                <a
                  href={`https://www.imdb.com/title/${movieData.imdb_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 font-bold px-5 py-2.5 rounded-full border border-amber-500/30 transition-all duration-200"
                >
                  <span className="text-xs font-black tracking-wider">IMDb</span>
                </a>
              )}
            </div>
          </div>
        </div>

        {trailerId && (
          <section id="trailer" className="mt-16 scroll-mt-20">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-1 h-8 bg-red-500 rounded-full" />
              <h2 className="text-2xl font-bold text-white">Trailer Oficial</h2>
            </div>
            <div className="relative w-full aspect-video rounded-2xl overflow-hidden shadow-2xl shadow-black/50 border border-[#2d3748] bg-black">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${trailerId}?rel=0&modestbranding=1&color=white`}
                title={`Trailer de ${movieData.title}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="absolute inset-0 w-full h-full"
                loading="lazy"
              />
            </div>
          </section>
        )}

        {cast.length > 0 && (
          <section className="mt-16">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-1 h-8 bg-blue-500 rounded-full" />
              <h2 className="text-2xl font-bold text-white">Reparto Principal</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {cast.map((actor) => {
                const profileUrl = getProfileUrl(actor.profile_path, 'w185')
                return (
                  <div
                    key={actor.cast_id}
                    className="bg-[#1a2236] border border-[#2d3748] rounded-xl overflow-hidden hover:border-blue-500/40 transition-colors duration-200 group"
                  >
                    <div className="relative aspect-[2/3] bg-[#1e293b] overflow-hidden">
                      {profileUrl ? (
                        <Image
                          src={profileUrl}
                          alt={actor.name}
                          fill
                          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
                          className="object-cover object-top group-hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <svg
                            className="w-10 h-10 text-slate-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1}
                              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                            />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="p-2.5">
                      <p className="text-white font-semibold text-xs leading-tight line-clamp-2">
                        {actor.name}
                      </p>
                      <p className="text-slate-500 text-xs mt-0.5 line-clamp-1">
                        {actor.character}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {movieData.production_companies.length > 0 && (
          <section className="mt-16">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-1 h-8 bg-slate-500 rounded-full" />
              <h2 className="text-xl font-bold text-white">Producción</h2>
            </div>
            <div className="flex flex-wrap gap-3">
              {movieData.production_companies.map((company) => (
                <div
                  key={company.id}
                  className="flex items-center gap-2.5 bg-[#1e293b] border border-[#2d3748] rounded-xl px-4 py-2.5"
                >
                  {company.logo_path ? (
                    <div className="relative w-10 h-6 shrink-0">
                      <Image
                        src={`https://image.tmdb.org/t/p/w92${company.logo_path}`}
                        alt={company.name}
                        fill
                        sizes="40px"
                        className="object-contain filter brightness-0 invert opacity-70"
                        loading="lazy"
                      />
                    </div>
                  ) : null}
                  <span className="text-slate-300 text-sm font-medium">{company.name}</span>
                  {company.origin_country && (
                    <span className="text-slate-600 text-xs">{company.origin_country}</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
