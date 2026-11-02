import ShareAppButton from '@/components/ShareAppButton'
import { getTrendingMovies } from '@/lib/tmdb'
import HeroSection from '@/components/HeroSection'
import MusicForYouSection from '@/components/MusicForYouSection'
import FreeServicesSection from '@/components/FreeServicesSection'
import FreeMoviesHome from '@/components/FreeMoviesHome'
import type { Movie, MoviesResponse } from '@/types/tmdb'
import Link from 'next/link'
import { Clapperboard, Sparkles } from 'lucide-react'

export const revalidate = 3600

const emptyResponse: MoviesResponse = { page: 1, results: [], total_pages: 0, total_results: 0 }

export default async function HomePage() {
  // Solo la portada grande usa el catálogo de TMDB; las filas son películas que se ven en la app
  const trendingData = await getTrendingMovies().catch(() => emptyResponse)
  const heroMovie: Movie | undefined = trendingData.results[0]

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
            <span className="block text-slate-400 text-sm">En español, clásicos de dominio público y Pluto TV, dentro de la app. Gratis y legales.</span>
          </span>
        </Link>
        <Link href="/novedades" className="-mt-12 flex items-center gap-2 text-sm text-slate-400 hover:text-white">
          <Sparkles className="w-4 h-4 text-fuchsia-300" /> Novedades: cómo ha crecido la app
        </Link>
        <ShareAppButton className="-mt-12" />

        <FreeMoviesHome />

        <FreeServicesSection />

        <MusicForYouSection />

      </div>
    </div>
  )
}
