'use client'

import { useEffect } from 'react'
import { useMusicStore } from '@/store/musicStore'
import { useAccountStore } from '@/store/accountStore'
import { pingDaily, reportPlay, reportError } from '@/lib/usage'
import { getNative } from '@/lib/native'

// Para el panel de administración: el dispositivo se usó hoy, qué canciones suenan y los errores.
export default function UsageReporter() {
  const token = useAccountStore((s) => s.token)
  useEffect(() => {
    const t = setTimeout(() => pingDaily(!!token), 4000)
    return () => clearTimeout(t)
  }, [token])

  useEffect(() => {
    // Canción que de verdad empezó a sonar
    const unsub = useMusicStore.subscribe((s, prev) => {
      if (!s.soundingId || s.soundingId === prev.soundingId) return
      const t = s.queue.find((v) => v.id === s.soundingId)
      if (t && !t.streamUrl) reportPlay(t)
    })
    const onError = (e: ErrorEvent) => reportError('js', e.error ?? e.message)
    const onReject = (e: PromiseRejectionEvent) => reportError('promesa', e.reason)
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
