import { Suspense } from 'react'
import type { Metadata } from 'next'
import MusicSearchClient from '@/components/MusicSearchClient'
import type { MusicVideo } from '@/lib/youtube-music'

export const metadata: Metadata = {
  title: 'PulsoMedia Música — Videos Musicales HD',
  description:
    'Reproduce videos musicales en HD con reproductor persistente. Navega por la app sin interrumpir tu música.',
  openGraph: {
    title: 'PulsoMedia Música',
    description: 'Videos musicales HD con reproductor que no para al navegar.',
    type: 'music.playlist',
  },
}

export const revalidate = 3600

export default async function MusicPage() {
  // Sin Tendencias: la portada de Música muestra artistas parecidos a los de tu biblioteca
  const initialVideos: MusicVideo[] = []

  return (
    <Suspense>
      <MusicSearchClient initialVideos={initialVideos} />
    </Suspense>
  )
}
