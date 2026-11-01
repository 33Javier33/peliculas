'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Download } from 'lucide-react'
import { useOfflineStore } from '@/store/offlineStore'
import { useMovieStore } from '@/store/movieStore'
import { getNative } from '@/lib/native'

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
    return () => {
      clearTimeout(t)
      window.removeEventListener('online', resume)
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
