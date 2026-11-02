import type { Metadata } from 'next'
import NtsClient from '@/components/NtsClient'

export const metadata: Metadata = {
  title: 'NTS Radio',
  description: 'NTS Radio en vivo desde Londres y sus Infinite Mixtapes, dentro de la app.',
}

export default function NtsPage() {
  return <NtsClient />
}
