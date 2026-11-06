'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// App de Android: un enlace que llega con la app abierta se abre aquí, cambiando de pantalla sin
// recargar la página (la música sigue sonando). La app llama a window.__cpnOpenLink(url).
export default function NativeLinkBridge() {
  const router = useRouter()
  useEffect(() => {
    const w = window as unknown as { __cpnOpenLink?: (url: string) => boolean }
    w.__cpnOpenLink = (url: string) => {
      try {
        const u = new URL(url, window.location.href)
        if (u.origin !== window.location.origin) return false
        router.push(`${u.pathname}${u.search}${u.hash}`)
        // Las páginas compartidas releen el enlace (si ya estaba abierta otra del mismo tipo)
        setTimeout(() => window.dispatchEvent(new Event('cpn-link')), 300)
        return true
      } catch {
        return false
      }
    }
    return () => {
      delete w.__cpnOpenLink
    }
  }, [router])
  return null
}
