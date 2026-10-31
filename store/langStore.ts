import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

// Idioma al que se traducen las descripciones (se recuerda en el teléfono)
interface LangState {
  lang: string
  setLang: (l: string) => void
}

export const useLangStore = create<LangState>()(
  persist((set) => ({ lang: 'es', setLang: (lang) => set({ lang }) }), {
    name: 'cpn-translate-lang',
    storage: createJSONStorage(() => localStorage),
  })
)
