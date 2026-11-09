'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Download } from 'lucide-react'
import { useOfflineStore } from '@/store/offlineStore'
import { useMovieStore } from '@/store/movieStore'
import { getNative } from '@/lib/native'
import { warmLibraryCovers } from '@/lib/cover-cache'
import { phoneStorageAvailable } from '@/lib/phone-storage'
import { restoreDownloads } from '@/lib/phone-restore'
import { startPhoneBackup } from '@/lib/local-backup'
import { autoImportSibling } from '@/lib/sibling-library'

// Descargas en segundo plano: retoma las pendientes (al abrir la app o al volver la conexión),
// avisa al teléfono para que no corte la descarga al salir de la app (APK) y muestra los avisos
export default function OfflineManager() {
  const notice = useOfflineStore((s) => s.notice)
  const progress = useOfflineStore((s) => s.progress)
  const [shown, setShown] = useState<string | null>(null)

  useEffect(() => {
    const resume = () => {
      useOfflineStore.getState().resume()
      useMovieStore.getState().resume()
    }
    const t = setTimeout(resume, 3000)
    window.addEventListener('online', resume)
    // Las descargas que fallaron (p. ej. se cortó la conexión) se reintentan solas: al volver la
    // conexión, al volver a la app y cada 10 minutos
    const retry = () => navigator.onLine && useOfflineStore.getState().retryFailures()
    const firstRetry = setTimeout(retry, 15000)
    const every = setInterval(retry, 10 * 60 * 1000)
    const onOnlineRetry = () => setTimeout(retry, 5000)
    const onVisRetry = () => document.visibilityState === 'visible' && retry()
    window.addEventListener('online', onOnlineRetry)
    document.addEventListener('visibilitychange', onVisRetry)
    // Carátulas de tu biblioteca guardadas para verse sin internet (en segundo plano)
    const covers = setTimeout(() => warmLibraryCovers(), 8000)
    // App de Android: canciones de YouTube descargadas en Opus → otra vez en M4A (suenan siempre)
    const repair = setTimeout(async () => {
      if (!getNative()) return
      // Lo guardado en la música del teléfono (p. ej. tras reinstalar) vuelve solo, si hay permiso
      if (phoneStorageAvailable()) await restoreDownloads().catch(() => null)
      if (!navigator.onLine) return
      await useOfflineStore.getState().repairOpus()
      // Lo descargado dentro de la app pasa a la música del teléfono (no se pierde al desinstalar)
      useOfflineStore.getState().migrateToPhone()
    }, 6000)
    // Respaldo de la biblioteca en el teléfono (queda aunque se desinstale la app)
    const stopBackup = startPhoneBackup()
    // PulsoMedia ↔ PulsoMusic en el mismo teléfono: la primera vez se trae la biblioteca de la otra
    const sibling = setTimeout(() => getNative() && autoImportSibling(), 4000)
    // Descargas compartidas (misma carpeta): al dar el permiso de música y al volver a la app
    // (cada 3 min como máximo) aparecen las que bajó la otra app
    let lastRestore = 0
    const restoreShared = () => {
      if (!getNative() || !phoneStorageAvailable() || Date.now() - lastRestore < 3 * 60_000) return
      lastRestore = Date.now()
      restoreDownloads().catch(() => null)
    }
    const onPerm = () => {
      lastRestore = 0
      restoreShared()
    }
    const onVisShared = () => document.visibilityState === 'visible' && restoreShared()
    window.addEventListener('cpn-audio-permission', onPerm)
    document.addEventListener('visibilitychange', onVisShared)
    const onOnline = () => setTimeout(() => warmLibraryCovers(), 3000)
    window.addEventListener('online', onOnline)
    return () => {
      stopBackup()
      clearTimeout(sibling)
      window.removeEventListener('cpn-audio-permission', onPerm)
      document.removeEventListener('visibilitychange', onVisShared)
      clearTimeout(t)
      clearTimeout(covers)
      clearTimeout(repair)
      window.removeEventListener('online', resume)
      window.removeEventListener('online', onOnline)
    }
  }, [])

  // Con la app en segundo plano se pausan las animaciones decorativas: el teléfono dedica el
  // procesador al audio (menos riesgo de chasquidos)
  useEffect(() => {
    const onVis = () => document.documentElement.classList.toggle('cpn-hidden', document.visibilityState === 'hidden')
    onVis()
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  useEffect(() => {
    if (!notice) return
    setShown(notice.text)
    const t = setTimeout(() => setShown(null), 4500)
    return () => clearTimeout(t)
  }, [notice])

  // App de Android: notificación "Descargando…" mientras haya descargas (así sigue al salir)
  const groups = Object.entries(progress)
  const movieActive = useMovieStore((s) => s.active)
  const movieId = Object.keys(movieActive)[0]
  const moviePct = movieId ? Math.round((movieActive[movieId] || 0) * 100) : 0
  const active = groups.length > 0 || !!movieId
  const first = groups[0]?.[1] ?? (movieId ? { done: moviePct, total: 100 } : undefined)
  const title = groups.length
    ? useOfflineStore.getState().queue[groups[0][0]]?.group.title ?? 'Música'
    : movieId
      ? useMovieStore.getState().downloads[movieId]?.movie.title ?? 'Película'
      : ''
  useEffect(() => {
    const n = getNative() as (ReturnType<typeof getNative> & { downloadState?(json: string): void }) | null
    if (!n?.downloadState) return
    try {
      n.downloadState(JSON.stringify(active ? { active, title, done: first?.done ?? 0, total: first?.total ?? 0 } : { active: false }))
    } catch {}
  }, [active, title, first?.done, first?.total])

  if (!shown) return null
  const done = shown.startsWith('✓') || shown.startsWith('Ya está')
  return (
    <div className="fixed inset-x-0 bottom-[calc(56px+96px)] sm:bottom-28 z-[130] flex justify-center px-4 pointer-events-none">
      <Link
        href={/pel[ií]cula/i.test(shown) ? '/peliculas?tab=saved' : '/music/library#descargas'}
        onClick={() => setShown(null)}
        className="pointer-events-auto max-w-md flex items-center gap-2 rounded-2xl bg-surface-2/[0.98] border border-white/10 shadow-2xl px-4 py-3 text-sm text-white"
      >
        {done ? <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" /> : <Download className="w-5 h-5 text-violet-300 shrink-0" />}
        <span>{shown.replace(/^✓ /, '')}</span>
      </Link>
    </div>
  )
}
