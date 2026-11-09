import type { Metadata } from 'next'
import SharedPlaylistClient from '@/components/SharedPlaylistClient'

// Compartida desde PulsoMusic (?app=music): la vista previa dice PulsoMusic y lleva su imagen
export function generateMetadata({ searchParams }: { searchParams?: { app?: string } }): Metadata {
  const music = searchParams?.app === 'music'
  const brand = music ? 'PulsoMusic' : 'PulsoMedia'
  return {
    title: 'Playlist compartida',
    description: `Te compartieron una playlist en ${brand}`,
    openGraph: {
      title: `Playlist compartida — ${brand}`,
      siteName: brand,
      description: 'Escúchala y guárdala en tus playlists',
      images: music ? [{ url: '/brand/og-music.jpg', width: 1200, height: 630, alt: 'PulsoMusic' }] : undefined,
    },
  }
}

export default function SharedPlaylistPage() {
  return <SharedPlaylistClient />
}
