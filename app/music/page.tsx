import type { Metadata } from 'next'
import { getTrendingMusicVideos } from '@/lib/youtube-music'
import MusicSearchClient from '@/components/MusicSearchClient'
import type { MusicVideo } from '@/lib/youtube-music'

export const metadata: Metadata = {
  title: 'CarlosPN Music Station — Videos Musicales HD',
  description:
    'Reproduce videos musicales en HD con reproductor persistente. Navega por la app sin interrumpir tu música.',
  openGraph: {
    title: 'CarlosPN Music Station',
    description: 'Videos musicales HD con reproductor que no para al navegar.',
    type: 'music.playlist',
  },
}

export const revalidate = 3600

export default async function MusicPage() {
  let initialVideos: MusicVideo[] = []

  try {
    initialVideos = await getTrendingMusicVideos()
  } catch {
    // Error handled gracefully in the client component
  }

  return <MusicSearchClient initialVideos={initialVideos} />
}
