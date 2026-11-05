import type { Metadata } from 'next'
import SharedPlaylistClient from '@/components/SharedPlaylistClient'

export const metadata: Metadata = {
  title: 'Playlist compartida',
  description: 'Te compartieron una playlist en PulsoMedia',
  openGraph: { title: 'Playlist compartida — PulsoMedia', description: 'Escúchala y guárdala en tus playlists' },
}

export default function SharedPlaylistPage() {
  return <SharedPlaylistClient />
}
