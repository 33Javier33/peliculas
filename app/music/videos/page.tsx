import type { Metadata } from 'next'
import MusicVideosClient from '@/components/MusicVideosClient'

export const metadata: Metadata = { title: 'Videos musicales' }

// Videos musicales (PulsoMusic): buscar y ver videos oficiales; al terminar uno sigue otro
export default function MusicVideosPage() {
  return <MusicVideosClient />
}
