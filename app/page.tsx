import { getTrendingMovies, getPopularMovies } from '@/lib/tmdb'
import HeroSection from '@/components/HeroSection'
import MovieGrid from '@/components/MovieGrid'
import MusicForYouSection from '@/components/MusicForYouSection'
import type { Movie, MoviesResponse } from '@/types/tmdb'

export const revalidate = 3600

const emptyResponse: MoviesResponse = { page: 1, results: [], total_pages: 0, total_results: 0 }

export default async function HomePage() {
  const [trendingData, popularData] = await Promise.all([
    getTrendingMovies().catch(() => emptyResponse),
    getPopularMovies(1).catch(() => emptyResponse),
  ])

  const heroMovie: Movie | undefined = trendingData.results[0]
  const trendingMovies = trendingData.results.slice(1, 13)
  const popularMovies = popularData.results.slice(0, 12)

  return (
    <div>
      {heroMovie && <HeroSection movie={heroMovie} />}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 space-y-16">
        <MusicForYouSection />

        <section>
          <div className="flex items-center gap-3 mb-8">
            <div className="w-1 h-8 bg-amber-400 rounded-full" />
            <h2 className="text-2xl font-bold text-white">En Tendencia</h2>
            <span className="text-slate-400 text-sm font-normal">esta semana</span>
          </div>
          <MovieGrid movies={trendingMovies} />
        </section>

        <section>
          <div className="flex items-center gap-3 mb-8">
            <div className="w-1 h-8 bg-blue-500 rounded-full" />
            <h2 className="text-2xl font-bold text-white">Películas Populares</h2>
          </div>
          <MovieGrid movies={popularMovies} />
        </section>
      </div>
    </div>
  )
}
