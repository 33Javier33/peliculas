import type { Metadata } from 'next'
import SharedPlaylistClient from '@/components/SharedPlaylistClient'

export const metadata: Metadata = {
  title: 'Playlist compartida',
  description: 'Te compartieron una playlist en Carlos P. Nauto Interactive',
  openGraph: { title: 'Playlist compartida — Carlos P. Nauto Interactive', description: 'Escúchala y guárdala en tus playlists' },
}

export default function SharedPlaylistPage() {
  return <SharedPlaylistClient />
}
