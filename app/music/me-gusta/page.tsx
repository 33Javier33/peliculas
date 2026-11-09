import type { Metadata } from 'next'
import LikedSongsClient from '@/components/LikedSongsClient'

export const metadata: Metadata = { title: 'Tus me gusta' }

// Tus me gusta: las canciones a las que les diste ♥ (como su propio disco)
export default function LikedPage() {
  return <LikedSongsClient />
}
