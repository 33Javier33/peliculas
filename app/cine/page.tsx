import type { Metadata } from 'next'
import { getTrendingMoviesOnYouTube, getVideoDetails } from '@/lib/youtube'
import CineClientPage from '@/components/CineClientPage'

export const metadata: Metadata = {
  title: 'CineLatino Pro — Películas Completas en YouTube',
  description:
    'Busca y reproduce películas completas en español latino disponibles en YouTube. Contenido HD gratuito.',
  openGraph: {
    title: 'CineLatino Pro',
    description: 'Películas completas en español latino desde YouTube.',
    type: 'website',
  },
}

export const revalidate = 3600

export default async function CinePage() {
  let initialItems: import('@/lib/youtube').YouTubeSearchItem[] = []
  let initialNextPageToken: string | undefined = undefined
  let initialVideoDetails: Record<string, import('@/lib/youtube').YouTubeVideoItem> = {}

  try {
    const data = await getTrendingMoviesOnYouTube()
    initialItems = data.items
    initialNextPageToken = data.nextPageToken

    if (initialItems.length > 0) {
      const ids = initialItems.map((i) => i.id.videoId).filter(Boolean)
      const details = await getVideoDetails(ids)
      for (const v of details.items) {
        initialVideoDetails[v.id] = v
      }
    }
  } catch {
    // La UI de error se maneja en el cliente
  }

  return (
    <CineClientPage
      initialItems={initialItems}
      initialNextPageToken={initialNextPageToken}
      initialVideoDetails={initialVideoDetails}
    />
  )
}
