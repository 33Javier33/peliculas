import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

// Artistas y grupos que sigue el usuario (datos de Deezer). Se guardan en el teléfono.
export interface FollowedArtist {
  id: number
  name: string
  picture: string
  followedAt: number
}

interface FollowState {
  artists: FollowedArtist[]
  toggleFollow: (a: { id: number; name: string; picture: string }) => void
}

export const useFollowStore = create<FollowState>()(
  persist(
    (set, get) => ({
      artists: [],
      toggleFollow: (a) => {
        const { artists } = get()
        set({
          artists: artists.some((x) => x.id === a.id)
            ? artists.filter((x) => x.id !== a.id)
            : [{ id: a.id, name: a.name, picture: a.picture, followedAt: Date.now() }, ...artists],
        })
      },
    }),
    { name: 'cpn-follow-store', storage: createJSONStorage(() => localStorage) }
  )
)
