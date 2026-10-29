import type { Metadata } from 'next'
import StatusClient from '@/components/StatusClient'

export const metadata: Metadata = { title: 'Estado de las fuentes', robots: { index: false } }

export default function StatusPage() {
  return <StatusClient />
}
