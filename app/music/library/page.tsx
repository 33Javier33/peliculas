import type { Metadata } from 'next'
import { Suspense } from 'react'
import MusicLibraryClient from '@/components/MusicLibraryClient'

export const metadata: Metadata = {
  title: 'Mi Biblioteca — PulsoMedia',
  description: 'Tus canciones guardadas, filtra por artista, álbum o discografía.',
}

export default function MusicLibraryPage() {
  return (
    <Suspense>
      <MusicLibraryClient />
    </Suspense>
  )
}
