import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

// Videos guardados en la sección Videos: "Me gusta" (los buenos) y "Ver más tarde".
// Se guardan en el teléfono, como la biblioteca de música.
export interface SavedVideo {
  id: string
  title: string
  channelTitle: string
  thumbnail: string
  duration?: string
  addedAt: number
}

type ListName = 'liked' | 'watchLater'

interface VideoState {
  liked: SavedVideo[]
  watchLater: SavedVideo[]
  toggle: (list: ListName, video: Omit<SavedVideo, 'addedAt'>) => void
  remove: (list: ListName, id: string) => void
}

export const useVideoStore = create<VideoState>()(
  persist(
    (set, get) => ({
      liked: [],
      watchLater: [],

      toggle: (list, video) => {
        const current = get()[list]
        set({
          [list]: current.some((v) => v.id === video.id)
            ? current.filter((v) => v.id !== video.id)
            : [{ ...video, addedAt: Date.now() }, ...current],
        } as Pick<VideoState, ListName>)
      },

      remove: (list, id) => set({ [list]: get()[list].filter((v) => v.id !== id) } as Pick<VideoState, ListName>),
    }),
    {
      name: 'cpn-video-store',
      storage: createJSONStorage(() => localStorage),
      version: 1,
    }
  )
)
