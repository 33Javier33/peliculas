import type { Metadata } from 'next'
import PlaylistClient from '@/components/PlaylistClient'

export const metadata: Metadata = { title: 'Playlist', robots: { index: false } }

// Las playlists se guardan en el teléfono: la página se arma en el navegador
export default function PlaylistPage({ params }: { params: { id: string } }) {
  return <PlaylistClient id={params.id} />
}
