import { getTrendingMovies, getPopularMovies } from '@/lib/tmdb'
import HeroSection from '@/components/HeroSection'
import MovieGrid from '@/components/MovieGrid'
import MusicForYouSection from '@/components/MusicForYouSection'
import type { Movie, MoviesResponse } from '@/types/tmdb'
import Link from 'next/link'
import { Clapperboard } from 'lucide-react'

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
        <Link
          href="/peliculas"
          className="flex items-center gap-4 rounded-2xl border border-violet-500/30 bg-gradient-to-r from-violet-500/20 to-fuchsia-500/10 px-5 py-4 hover:border-violet-400/60 transition-colors"
        >
          <span className="shrink-0 w-12 h-12 rounded-full bg-violet-500 text-white flex items-center justify-center shadow-glow">
            <Clapperboard className="w-6 h-6" />
          </span>
          <span className="min-w-0">
            <span className="block text-white font-bold font-display text-lg">Películas gratis completas</span>
            <span className="block text-slate-400 text-sm">Pluto TV y clásicos de Internet Archive. Gratis y legales.</span>
          </span>
        </Link>

        <MusicForYouSection />

        <section>
          <div className="flex items-center gap-3 mb-8">
            <div className="w-1 h-8 bg-violet-500 rounded-full" />
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
