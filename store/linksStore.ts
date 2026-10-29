import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { MusicVideo } from '@/lib/youtube-music'

// Canciones agregadas desde enlaces (MP3 u otras páginas). Se guardan en el teléfono.
interface LinksState {
  tracks: MusicVideo[]
  addTracks: (tracks: MusicVideo[]) => number
  removeTrack: (id: string) => void
}

export const useLinksStore = create<LinksState>()(
  persist(
    (set, get) => ({
      tracks: [],
      addTracks: (tracks) => {
        const known = new Set(get().tracks.map((t) => t.audioUrl))
        const fresh = tracks.filter((t) => t.audioUrl && !known.has(t.audioUrl))
        if (fresh.length) set({ tracks: [...fresh, ...get().tracks].slice(0, 1000) })
        return fresh.length
      },
      removeTrack: (id) => set({ tracks: get().tracks.filter((t) => t.id !== id) }),
    }),
    { name: 'cpn-links-store', storage: createJSONStorage(() => localStorage) }
  )
)
