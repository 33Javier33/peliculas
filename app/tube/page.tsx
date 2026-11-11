import type { Metadata } from 'next'
import PulsoTubeClient from '@/components/PulsoTubeClient'

export const metadata: Metadata = {
  title: 'PulsoTube',
  description: 'Busca videos y pega enlaces de YouTube, con recomendaciones de lo que miras y te gusta.',
}

export default function PulsoTubePage() {
  return <PulsoTubeClient />
}
