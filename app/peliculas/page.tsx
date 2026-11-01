import type { Metadata } from 'next'
import FreeMoviesClient from '@/components/FreeMoviesClient'

export const metadata: Metadata = {
  title: 'Películas gratis',
  description: 'Películas completas, gratis y legales: cine en español y clásicos de dominio público (Internet Archive y Wikimedia Commons) y Pluto TV a la carta.',
}

export default function FreeMoviesPage() {
  return <FreeMoviesClient />
}
