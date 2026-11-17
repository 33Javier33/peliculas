'use client'

import { useEffect } from 'react'
import { useMovieStore, type WatchEntry, type MovieDownload } from '@/store/movieStore'
import { useAccountStore } from '@/store/accountStore'
import { deviceId, pullWatching, pushWatching, pushDownloads } from '@/lib/supabase-movies'

function diff<T>(prev: Record<string, T>, next: Record<string, T>) {
  const changed: Record<string, T> = {}
  for (const id in next) if (prev[id] !== next[id]) changed[id] = next[id]
  const removed = Object.keys(prev).filter((id) => !(id in next))
  return { changed, removed }
}

// Respaldo de "Seguir viendo" y del registro de descargas en Supabase.
// Con sesión iniciada se usa el correo (se comparte entre dispositivos); sin sesión, un id del dispositivo.
export default function MovieCloudSync() {
  const email = useAccountStore((s) => s.email)

  useEffect(() => {
    const userId = email ?? deviceId()
    let synced: { watching: Record<string, WatchEntry>; downloads: Record<string, MovieDownload> } = { watching: {}, downloads: {} }
    let timer: ReturnType<typeof setTimeout> | undefined
    let cancelled = false
    let busy = false

    const flush = async () => {
      if (cancelled || busy || !navigator.onLine) return
      busy = true
      const { watching, downloads } = useMovieStore.getState()
      const w = diff(synced.watching, watching)
      const d = diff(synced.downloads, downloads)
      try {
        await pushWatching(userId, w.changed, w.removed)
        await pushDownloads(userId, d.changed, d.removed)
        synced = { watching, downloads }
      } catch (e) {
        console.warn('[peliculas-supabase]', (e as Error).message)
      } finally {
        busy = false
      }
    }
    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(flush, 3000)
    }

    ;(async () => {
      try {
        const remote = await pullWatching(userId)
        if (cancelled) return
        const merged: Record<string, WatchEntry> = { ...remote }
        for (const [id, e] of Object.entries(useMovieStore.getState().watching)) {
          if (!merged[id] || e.at >= merged[id].at) merged[id] = e
        }
        Object.keys(merged)
          .sort((a, b) => merged[b].at - merged[a].at)
          .slice(30)
          .forEach((id) => delete merged[id])
        synced.watching = remote
        useMovieStore.setState({ watching: merged })
      } catch (e) {
        console.warn('[peliculas-supabase]', (e as Error).message)
      }
      flush()
    })()

    const unsub = useMovieStore.subscribe((s, prev) => {
      if (s.watching !== prev.watching || s.downloads !== prev.downloads) schedule()
    })
    window.addEventListener('online', schedule)
    return () => {
      cancelled = true
      clearTimeout(timer)
      unsub()
      window.removeEventListener('online', schedule)
    }
  }, [email])

  return null
}
