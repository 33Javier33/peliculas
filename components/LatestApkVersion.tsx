'use client'
import { isMusicApp } from '@/lib/app-flavor'

import { useEffect, useState } from 'react'

// Última versión publicada (teléfono y reloj comparten el número): para comparar con la instalada
export default function LatestApkVersion({ prefix = 'Última versión' }: { prefix?: string }) {
  const [v, setV] = useState<string | null>(null)
  useEffect(() => {
    fetch(`/api/apk/version${isMusicApp() ? '?app=music' : ''}`)
      .then((r) => r.json())
      .then((d: { version?: string }) => setV(d.version ?? null))
      .catch(() => {})
  }, [])
  if (!v) return null
  return <span>{prefix}: {v}</span>
}
