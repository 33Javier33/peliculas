import type { Metadata } from 'next'
import ArchiveArtistClient from '@/components/ArchiveArtistClient'

export const metadata: Metadata = { title: 'Artista de Internet Archive' }

// Un artista de Internet Archive: todos sus discos (discografía) para escuchar
export default function ArchiveArtistPage({ params }: { params: { name: string } }) {
  return <ArchiveArtistClient name={decodeURIComponent(params.name)} />
}
