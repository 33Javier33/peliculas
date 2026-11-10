import type { Metadata } from 'next'
import MusicFeedClient from '@/components/MusicFeedClient'

export const metadata: Metadata = { title: 'Videos para ti — Música' }

export default function MusicFeedPage() {
  return <MusicFeedClient />
}
