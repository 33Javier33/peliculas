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
  // Enlaces antiguos de canciones de discos o MP3 (/play/link-…): no traían la canción
  if (params.id.startsWith('link-'))
    return (
      <div className="pt-32 min-h-screen text-center px-6">
        <p className="text-white text-lg font-semibold">Este enlace es de una versión anterior de la app</p>
        <p className="text-slate-400 text-sm mt-2">Pide que te compartan la canción de nuevo: ahora el enlace la abre directo.</p>
        <a href="/music" className="inline-block mt-6 text-violet-300 underline">
          Ir a Música
        </a>
      </div>
    )
  if (!isYouTubeId(params.id)) notFound()
  const video = await getSharedVideo(params.id)
  return <SharedTrackClient video={video} />
}
