import type { Metadata } from 'next'
import { Suspense } from 'react'
import TvClient from '@/components/TvClient'

export const metadata: Metadata = {
  title: 'TV en vivo',
  description: 'Canales de televisión nacionales e internacionales en vivo.',
}

export default function TvPage() {
  return (
    <Suspense>
      <TvClient />
    </Suspense>
  )
}
