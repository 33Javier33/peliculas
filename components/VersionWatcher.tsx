'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useMusicStore } from '@/store/musicStore'

// Versión nueva publicada: se carga sola en un momento que no interrumpe nada (con la música en
// pausa y la app en segundo plano, o al cambiar de sección con la música detenida). Mientras
// suena algo, la app sigue con la versión actual: nunca se recarga con música sonando.
const CURRENT = process.env.NEXT_PUBLIC_APP_VERSION

export default function VersionWatcher() {
  const stale = useRef(false)
  const pathname = usePathname()
  const firstPath = useRef(pathname)
  const checkRef = useRef<() => void>(() => {})

  const quiet = () => {
    const st = useMusicStore.getState()
    const media = Array.from(document.querySelectorAll('audio, video')) as HTMLMediaElement[]
    return !st.isPlaying && media.every((m) => m.paused)
  }
  const reloadIfQuiet = () => {
    if (stale.current && quiet()) window.location.reload()
  }

  useEffect(() => {
    let cancelled = false
    const check = () =>
      fetch('/api/version', { cache: 'no-store' })
        .then((r) => r.json())
        .then((d: { version?: string }) => {
          if (cancelled || !d.version || d.version === CURRENT) return
          stale.current = true
          if (document.hidden) reloadIfQuiet()
        })
        .catch(() => {})
    const t0 = setTimeout(check, 20000)
    const iv = setInterval(check, 10 * 60 * 1000)
    // Al salir de la app o volver: se revisa (y si quedó en segundo plano en pausa, se carga ya)
    const onVis = () => {
      if (document.hidden && stale.current) reloadIfQuiet()
      else check()
    }
    checkRef.current = check
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      clearTimeout(t0)
      clearInterval(iv)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  // Al cambiar de sección con la música detenida también se aprovecha para cargar la versión nueva
  useEffect(() => {
    if (pathname === firstPath.current) return
    if (stale.current) reloadIfQuiet()
    else checkRef.current()
  }, [pathname])

  return null
}
