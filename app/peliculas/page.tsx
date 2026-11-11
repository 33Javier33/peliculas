import { Suspense } from 'react'
import type { Metadata } from 'next'
import MoviesHub from '@/components/MoviesHub'

export const metadata: Metadata = {
  title: 'Películas',
  description: 'Películas completas, gratis y legales (dominio público, Pluto TV) y CineLatino: películas completas en español en YouTube.',
}

export default function MoviesPage() {
  return (
    <Suspense fallback={null}>
      <MoviesHub />
    </Suspense>
  )
}
