import type { Metadata } from 'next'
import ConvertClient from '@/components/ConvertClient'

export const metadata: Metadata = {
  title: 'Convertir YouTube a audio',
  description: 'Pega un enlace de YouTube y guarda solo el audio en tu biblioteca: sin video, para escucharlo sin internet.',
}

export default function ConvertPage() {
  return <ConvertClient />
}
