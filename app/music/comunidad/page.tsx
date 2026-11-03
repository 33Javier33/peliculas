import type { Metadata } from 'next'
import CommunityClient from '@/components/CommunityClient'

export const metadata: Metadata = {
  title: 'Comunidad de playlists',
  description: 'Playlists y mezclas por género que comparten quienes usan Carlos P. Nauto Interactive.',
}

export default function CommunityPage() {
  return <CommunityClient />
}
