import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

// PulsoTube: los videos que miraste (para recomendar cosas parecidas, no tendencias)
export interface TubeItem {
  id: string
  title: string
  channel: string
  at: number
}

interface TubeState {
  watched: TubeItem[]
  addWatched: (v: { id: string; title: string; channel: string }) => void
}

export const useTubeStore = create<TubeState>()(
  persist(
    (set, get) => ({
      watched: [],
      addWatched: (v) => {
        const rest = get().watched.filter((w) => w.id !== v.id)
        set({ watched: [{ ...v, at: Date.now() }, ...rest].slice(0, 60) })
      },
    }),
    {
      name: 'cpn-tube',
      storage: createJSONStorage(() => localStorage),
    }
  )
)
