'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// «No me interesa»: canciones o videos sueltos, o artistas enteros, que no deben volver a aparecer
// en listas, colas, recomendaciones, PulsoTube ni videos musicales. Se pueden recuperar en
// Configuración → Ocultados.

export interface BlockedItem {
  id: string
  title: string
  artist: string
  at: number
}

const norm = (s: string) =>
  (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s*-\s*topic$/, '')
    .replace(/vevo$/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

interface BlockState {
  songs: BlockedItem[]
  /** Artistas ocultos: clave normalizada → nombre para mostrar */
  artists: Record<string, string>
  blockSong: (item: { id: string; title: string; artist?: string }) => void
  blockArtist: (name: string) => void
  unblockSong: (id: string) => void
  unblockArtist: (key: string) => void
}

export const useBlockStore = create<BlockState>()(
  persist(
    (set, get) => ({
      songs: [],
      artists: {},
      blockSong: (item) => {
        if (get().songs.some((s) => s.id === item.id)) return
        set({ songs: [{ id: item.id, title: item.title, artist: item.artist ?? '', at: Date.now() }, ...get().songs].slice(0, 2000) })
      },
      blockArtist: (name) => {
        const k = norm(name)
        if (!k) return
        set({ artists: { ...get().artists, [k]: name.trim() } })
      },
      unblockSong: (id) => set({ songs: get().songs.filter((s) => s.id !== id) }),
      unblockArtist: (key) => {
        const next = { ...get().artists }
        delete next[key]
        set({ artists: next })
      },
    }),
    { name: 'cpn-blocked', version: 1 }
  )
)

/** Id de YouTube que comparten las distintas formas de una misma canción (yta-…, /api/stream?id=…) */
function ytKey(t: { id: string; audioUrl?: string }): string {
  const a = t.id.match(/^yta-([A-Za-z0-9_-]{11})$/)?.[1] ?? t.audioUrl?.match(/\/api\/stream\?id=([A-Za-z0-9_-]{11})/)?.[1]
  return a ?? t.id
}

/**
 * ¿Está oculta? Por su id o por su artista (el artista se compara con el canal, el artista de la
 * canción y el comienzo del título «Artista - Canción»).
 */
export function isBlocked(t: { id: string; title?: string; channelTitle?: string; channel?: string; artist?: string; audioUrl?: string }): boolean {
  const { songs, artists } = useBlockStore.getState()
  if (songs.length) {
    const k = ytKey(t)
    if (songs.some((s) => s.id === t.id || s.id === k)) return true
  }
  const keys = Object.keys(artists)
  if (!keys.length) return false
  const names = [t.artist, t.channelTitle, t.channel, t.title?.split(/ [-–—] /)[0]].filter(Boolean).map((x) => norm(x as string))
  return names.some((n) => keys.some((k) => matches(n, k)))
}

/** Mismo artista: igual, «Artista y algo más», o igual sin espacios (canales «BadBunnyVEVO») */
function matches(n: string, k: string): boolean {
  return n === k || n.startsWith(`${k} `) || (k.includes(' ') && n.replace(/ /g, '') === k.replace(/ /g, ''))
}

/** ¿Este artista está oculto? */
export function isArtistBlocked(name: string): boolean {
  const k = norm(name)
  return !!k && Object.keys(useBlockStore.getState().artists).some((a) => matches(k, a))
}

/** Quita de una lista lo oculto */
export function withoutBlocked<T extends { id: string; title?: string; channelTitle?: string; channel?: string; artist?: string; audioUrl?: string }>(list: T[]): T[] {
  const { songs, artists } = useBlockStore.getState()
  if (!songs.length && !Object.keys(artists).length) return list
  return list.filter((t) => !isBlocked(t))
}

/** Para que una pantalla se vuelva a dibujar cuando cambia lo oculto */
export function useBlockedVersion(): string {
  return useBlockStore((s) => `${s.songs.length}|${Object.keys(s.artists).length}`)
}
