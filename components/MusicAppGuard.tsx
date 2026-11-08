'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { isMusicApp } from '@/lib/app-flavor'

// PulsoMusic (app solo de música): lo que no es música (películas, TV, videos en general) lleva a
// Música. «Ver videos de…» va a Videos musicales con esa búsqueda.
export default function MusicAppGuard() {
  const pathname = usePathname()
  const router = useRouter()
  useEffect(() => {
    if (!isMusicApp()) return
    document.documentElement.dataset.app = 'music'
    if (pathname.startsWith('/cine')) {
      const q = new URLSearchParams(window.location.search).get('q')
      router.replace(q ? `/music/videos?q=${encodeURIComponent(q)}` : '/music/videos')
      return
    }
    const blocked = pathname === '/' || pathname === '/search' || pathname.startsWith('/peliculas') || pathname.startsWith('/movie') || pathname.startsWith('/tv')
    if (blocked) router.replace('/music')
  }, [pathname, router])
  return null
}
