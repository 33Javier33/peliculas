import type { Metadata } from 'next'
import { Suspense } from 'react'
import RadioClient from '@/components/RadioClient'

export const metadata: Metadata = {
  title: 'Radio en vivo',
  description: 'Escucha radios de tu país y de todo el mundo, también con la pantalla bloqueada.',
}

export default function RadioPage() {
  return (
    <Suspense>
      <RadioClient />
    </Suspense>
  )
}
