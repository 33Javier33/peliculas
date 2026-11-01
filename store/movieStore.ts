import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { FreeMovie } from '@/lib/pluto'
import { downloadVideoParts, deleteVideoParts, persistStorage } from '@/lib/offline-files'
import { useOfflineStore } from '@/store/offlineStore'

// Películas: "Seguir viendo" (dónde quedaste en cada una) y películas descargadas para ver sin
// conexión (se guardan por partes en el teléfono; si se corta la descarga, se retoma).

export interface WatchEntry {
  movie: FreeMovie
  /** Segundo en que quedó */
  t: number
  /** Duración total (segundos) */
  dur: number
  at: number
}

export interface MovieDownload {
  movie: FreeMovie
  url: string
  /** Partes guardadas */
  parts: number
  size: number
  total: number
  mime: string
  done: boolean
  savedAt: number
}

interface MovieState {
  watching: Record<string, WatchEntry>
  downloads: Record<string, MovieDownload>
  /** Descargas en curso (0..1) */
  active: Record<string, number>
  saveProgress: (movie: FreeMovie, t: number, dur: number) => void
  forget: (id: string) => void
  download: (movie: FreeMovie, url: string) => Promise<void>
  resume: () => void
  cancel: (id: string) => void
  remove: (id: string) => Promise<void>
}

const controllers = new Map<string, AbortController>()
const keyOf = (id: string) => `movie:${id}`
export const movieKey = keyOf

/** Datos de la película que vale la pena guardar (sin textos largos) */
const slim = (m: FreeMovie): FreeMovie => ({ ...m, summary: m.summary?.slice(0, 400) })

export const useMovieStore = create<MovieState>()(
  persist(
    (set, get) => ({
      watching: {},
      downloads: {},
      active: {},
      saveProgress: (movie, t, dur) => {
        if (!dur || !Number.isFinite(dur)) return
        // Casi terminada: sale de "Seguir viendo"
        if (t > dur - 90 || t / dur > 0.95) return get().forget(movie.id)
        if (t < 30) return
        set((s) => {
          const watching = { ...s.watching, [movie.id]: { movie: slim(movie), t, dur, at: Date.now() } }
          // Se guardan las últimas 30
          const ids = Object.keys(watching).sort((a, b) => watching[b].at - watching[a].at)
          ids.slice(30).forEach((id) => delete watching[id])
          return { watching }
        })
      },
      forget: (id) =>
        set((s) => {
          if (!s.watching[id]) return s
          const watching = { ...s.watching }
          delete watching[id]
          return { watching }
        }),
      download: async (movie, url) => {
        if (controllers.has(movie.id)) return
        const notify = useOfflineStore.getState().notify
        const prev = get().downloads[movie.id]
        if (prev?.done) return notify(`Ya está descargada la película "${movie.title}": se ve sin internet`)
        const start: MovieDownload = prev && prev.url === url ? prev : { movie: slim(movie), url, parts: 0, size: 0, total: 0, mime: 'video/mp4', done: false, savedAt: Date.now() }
        set((s) => ({ downloads: { ...s.downloads, [movie.id]: start }, active: { ...s.active, [movie.id]: start.total ? start.size / start.total : 0 } }))
        if (!prev) notify(`Descargando la película "${movie.title}"… puedes salir de la app, la descarga sigue`)
        await persistStorage()
        const ctrl = new AbortController()
        controllers.set(movie.id, ctrl)
        let tries = 0
        for (;;) {
          const cur = get().downloads[movie.id]
          if (!cur || ctrl.signal.aborted) break
          try {
            const r = await downloadVideoParts(
              url,
              keyOf(movie.id),
              cur.parts,
              (parts, bytes, total) =>
                set((s) => {
                  const d = s.downloads[movie.id]
                  if (!d) return s
                  return {
                    downloads: { ...s.downloads, [movie.id]: { ...d, parts, size: bytes, total } },
                    active: { ...s.active, [movie.id]: total ? Math.min(1, bytes / total) : 0 },
                  }
                }),
              ctrl.signal
            )
            set((s) => ({ downloads: { ...s.downloads, [movie.id]: { ...s.downloads[movie.id], parts: r.parts, size: r.size, total: r.size, mime: r.mime, done: true, savedAt: Date.now() } } }))
            notify(`✓ La película "${movie.title}" ya está descargada: se ve sin internet`)
            break
          } catch (err) {
            if ((err as Error).name === 'AbortError') break
            // Corte de conexión: se reintenta desde la última parte (y si no hay internet, al volver)
            if (++tries >= 4 || !navigator.onLine) break
            await new Promise((r) => setTimeout(r, 3000 * tries))
          }
        }
        controllers.delete(movie.id)
        set((s) => {
          const active = { ...s.active }
          delete active[movie.id]
          return { active }
        })
      },
      resume: () => {
        for (const d of Object.values(get().downloads)) if (!d.done) get().download(d.movie, d.url)
      },
      cancel: (id) => {
        controllers.get(id)?.abort()
        get().remove(id)
      },
      remove: async (id) => {
        controllers.get(id)?.abort()
        const d = get().downloads[id]
        set((s) => {
          const downloads = { ...s.downloads }
          const active = { ...s.active }
          delete downloads[id]
          delete active[id]
          return { downloads, active }
        })
        if (d) await deleteVideoParts(keyOf(id), d.parts)
      },
    }),
    {
      name: 'cpn-movies',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ watching: s.watching, downloads: s.downloads }),
    }
  )
)
