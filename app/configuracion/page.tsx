import type { Metadata } from 'next'
import SettingsClient from '@/components/SettingsClient'

export const metadata: Metadata = {
  title: 'Configuración',
  robots: { index: false },
}

export default function SettingsPage() {
  return <SettingsClient />
}
