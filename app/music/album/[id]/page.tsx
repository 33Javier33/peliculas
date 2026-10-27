import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getAlbum } from '@/lib/catalog'
import AlbumClient from '@/components/AlbumClient'

interface Props {
  params: { id: string }
}

export const revalidate = 86400

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!/^\d+$/.test(params.id)) return {}
  try {
    const album = await getAlbum(params.id)
    return {
      title: `${album.title} — ${album.artist.name}`,
      description: `Escucha el álbum completo ${album.title} de ${album.artist.name}.`,
      openGraph: { images: album.cover ? [{ url: album.cover }] : undefined },
    }
  } catch {
    return {}
  }
}

export default async function AlbumPage({ params }: Props) {
  if (!/^\d+$/.test(params.id)) notFound()
  const album = await getAlbum(params.id).catch(() => null)
  if (!album) notFound()
  return <AlbumClient album={album} />
}
