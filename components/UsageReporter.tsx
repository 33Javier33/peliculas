'use client'

import { useEffect } from 'react'
import { useMusicStore } from '@/store/musicStore'
import { useAccountStore } from '@/store/accountStore'
import { pingDaily, reportPlay, reportError, reportConnection } from '@/lib/usage'
import { getNative } from '@/lib/native'

// Para el panel de administración: el dispositivo se usó hoy, qué canciones suenan y los errores.
export default function UsageReporter() {
  const token = useAccountStore((s) => s.token)
  useEffect(() => {
    const t = setTimeout(() => pingDaily(!!token), 4000)
    return () => clearTimeout(t)
  }, [token])

  // Conexiones: al abrir y al volver a la app (como mucho una cada 30 min por dispositivo)
  useEffect(() => {
    const t = setTimeout(reportConnection, 5000)
    const onVis = () => document.visibilityState === 'visible' && reportConnection()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearTimeout(t)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  useEffect(() => {
    // Canción que de verdad empezó a sonar
    const unsub = useMusicStore.subscribe((s, prev) => {
      if (!s.soundingId || s.soundingId === prev.soundingId) return
      const t = s.queue.find((v) => v.id === s.soundingId)
      if (t && !t.streamUrl) reportPlay(t)
    })
    const onError = (e: ErrorEvent) => reportError('js', e.error ?? e.message)
    const onReject = (e: PromiseRejectionEvent) => {
      // Un archivo externo que no cargó (llega como «evento»): se anota y no se trata como error
      // grave de la página
      if (typeof Event !== 'undefined' && e.reason instanceof Event) e.preventDefault()
      reportError('promesa', e.reason)
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onReject)
    // La app del teléfono se cerró por un error la vez anterior (APK nuevas): se reporta
    const t = setTimeout(() => {
      try {
        const crash = (getNative() as unknown as { takeCrash?: () => string } | null)?.takeCrash?.()
        if (crash) reportError('android', crash)
      } catch {}
    }, 6000)
    return () => {
      unsub()
      clearTimeout(t)
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onReject)
    }
  }, [])
  return null
}
