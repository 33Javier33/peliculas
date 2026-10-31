import type { Metadata } from 'next'
import ArchiveAlbumClient from '@/components/ArchiveAlbumClient'

export const metadata: Metadata = { title: 'Disco de Internet Archive' }

// Un disco de Internet Archive: sus canciones para escuchar sin tener que guardarlo antes
export default function ArchiveAlbumPage({ params }: { params: { id: string } }) {
  return <ArchiveAlbumClient id={decodeURIComponent(params.id)} />
}
