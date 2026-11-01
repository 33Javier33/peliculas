'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { WifiOff } from 'lucide-react'

// Aviso cuando el teléfono no tiene internet: lo descargado sigue sonando
export default function OfflineBanner() {
  const [offline, setOffline] = useState(false)
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  if (!offline) return null
  return (
    <div className="fixed top-[64px] inset-x-0 z-[55] flex justify-center px-3 pointer-events-none">
      <Link
        href="/music/library#descargas"
        className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-amber-500/95 text-black text-xs font-semibold px-4 py-2 shadow-lg"
      >
        <WifiOff className="w-4 h-4" /> Sin conexión · escucha tus descargas
      </Link>
    </div>
  )
}
