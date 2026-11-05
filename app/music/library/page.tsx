import type { Metadata } from 'next'
import MusicLibraryClient from '@/components/MusicLibraryClient'

export const metadata: Metadata = {
  title: 'Mi Biblioteca — PulsoMedia',
  description: 'Tus canciones guardadas, filtra por artista, álbum o discografía.',
}

export default function MusicLibraryPage() {
  return <MusicLibraryClient />
}
