import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

// Vista Lista o Mosaico: una sola preferencia para todas las secciones (se recuerda en el teléfono)
export type ViewMode = 'list' | 'grid'

interface ViewState {
  view: ViewMode
  setView: (v: ViewMode) => void
}

export const useViewStore = create<ViewState>()(
  persist((set) => ({ view: 'list', setView: (view) => set({ view }) }), {
    name: 'cpn-view',
    storage: createJSONStorage(() => localStorage),
  })
)
