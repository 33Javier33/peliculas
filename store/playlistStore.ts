import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { MusicVideo } from '@/lib/youtube-music'

// Playlists propias: listas con nombre de cualquier canción (YouTube, discos, enlaces, radios no).
// Se guardan en el teléfono.

export interface Playlist {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  tracks: MusicVideo[]
}

interface PlaylistState {
  playlists: Playlist[]
  /** Canciones esperando que se elija a qué playlist van (abre la ventana "Agregar a playlist") */
  pending: MusicVideo[] | null
  openAdd: (tracks: MusicVideo[]) => void
  closeAdd: () => void
  create: (name: string, tracks?: MusicVideo[]) => string
  rename: (id: string, name: string) => void
  remove: (id: string) => void
  /** Agrega canciones (sin repetir). Devuelve cuántas eran nuevas. */
  addTracks: (id: string, tracks: MusicVideo[]) => number
  removeTrack: (id: string, trackId: string) => void
  moveTrack: (id: string, from: number, to: number) => void
}

// Solo lo necesario para volver a reproducirla (sin datos temporales del reproductor)
const clean = (t: MusicVideo): MusicVideo => {
  const { startAt: _s, isVideo: _v, ...rest } = t
  return rest
}

export const usePlaylistStore = create<PlaylistState>()(
  persist(
    (set, get) => ({
      playlists: [],
      pending: null,
      openAdd: (tracks) => set({ pending: tracks.filter((t) => !t.streamUrl) }),
      closeAdd: () => set({ pending: null }),
      create: (name, tracks = []) => {
        const id = `pl-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
        const now = Date.now()
        const seen = new Set<string>()
        const list = tracks.filter((t) => !t.streamUrl && !seen.has(t.id) && seen.add(t.id)).map(clean)
        set({ playlists: [{ id, name: name.trim() || 'Mi playlist', createdAt: now, updatedAt: now, tracks: list }, ...get().playlists] })
        return id
      },
      rename: (id, name) =>
        set({ playlists: get().playlists.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name, updatedAt: Date.now() } : p)) }),
      remove: (id) => set({ playlists: get().playlists.filter((p) => p.id !== id) }),
      addTracks: (id, tracks) => {
        let added = 0
        set({
          playlists: get().playlists.map((p) => {
            if (p.id !== id) return p
            const known = new Set(p.tracks.map((t) => t.id))
            const fresh = tracks.filter((t) => !t.streamUrl && !known.has(t.id) && known.add(t.id)).map(clean)
            added = fresh.length
            return fresh.length ? { ...p, tracks: [...p.tracks, ...fresh].slice(0, 2000), updatedAt: Date.now() } : p
          }),
        })
        return added
      },
      removeTrack: (id, trackId) =>
        set({
          playlists: get().playlists.map((p) =>
            p.id === id ? { ...p, tracks: p.tracks.filter((t) => t.id !== trackId), updatedAt: Date.now() } : p
          ),
        }),
      moveTrack: (id, from, to) =>
        set({
          playlists: get().playlists.map((p) => {
            if (p.id !== id || to < 0 || to >= p.tracks.length) return p
            const tracks = [...p.tracks]
            const [t] = tracks.splice(from, 1)
            tracks.splice(to, 0, t)
            return { ...p, tracks, updatedAt: Date.now() }
          }),
        }),
    }),
    {
      name: 'cpn-playlists',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ playlists: s.playlists }),
    }
  )
)
