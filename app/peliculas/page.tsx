import type { Metadata } from 'next'
import FreeMoviesClient from '@/components/FreeMoviesClient'

export const metadata: Metadata = {
  title: 'Películas gratis',
  description: 'Películas completas, gratis y legales: Pluto TV a la carta y clásicos de Internet Archive.',
}

export default function FreeMoviesPage() {
  return <FreeMoviesClient />
}
