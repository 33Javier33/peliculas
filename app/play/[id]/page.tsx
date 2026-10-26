import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getSharedVideo, isYouTubeId } from '@/lib/youtube-music'
import SharedTrackClient from '@/components/SharedTrackClient'

interface PlayPageProps {
  params: { id: string }
}

export async function generateMetadata({ params }: PlayPageProps): Promise<Metadata> {
  if (!isYouTubeId(params.id)) return {}
  const video = await getSharedVideo(params.id)
  const description = `Escúchala en Carlos P. Nauto Interactive${video.channelTitle ? ` · ${video.channelTitle}` : ''}`
  return {
    title: video.title,
    description,
    openGraph: {
      title: `${video.title} — Carlos P. Nauto Interactive`,
      description,
      type: 'music.song',
      images: [{ url: video.thumbnail, alt: video.title }],
    },
    twitter: { card: 'summary_large_image', title: video.title, description, images: [video.thumbnail] },
  }
}

export default async function PlayPage({ params }: PlayPageProps) {
  if (!isYouTubeId(params.id)) notFound()
  const video = await getSharedVideo(params.id)
  return <SharedTrackClient video={video} />
}
