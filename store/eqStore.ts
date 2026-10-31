import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

// Ecualizador: preajuste, ganancia de cada banda (dB) y nivelador de volumen (se recuerda)
export const EQ_BANDS = [
  { freq: 60, label: 'Graves', type: 'lowshelf' as BiquadFilterType },
  { freq: 230, label: 'Medios graves', type: 'peaking' as BiquadFilterType },
  { freq: 910, label: 'Medios', type: 'peaking' as BiquadFilterType },
  { freq: 3600, label: 'Presencia', type: 'peaking' as BiquadFilterType },
  { freq: 14000, label: 'Agudos', type: 'highshelf' as BiquadFilterType },
]

export const EQ_PRESETS: { id: string; name: string; gains: number[] }[] = [
  { id: 'flat', name: 'Normal', gains: [0, 0, 0, 0, 0] },
  { id: 'bass', name: 'Más graves', gains: [7, 4, 0, 0, 0] },
  { id: 'vocal', name: 'Voces', gains: [-2, -1, 3, 4, 1] },
  { id: 'rock', name: 'Rock', gains: [5, 2, -2, 2, 5] },
  { id: 'pop', name: 'Pop', gains: [-1, 2, 4, 2, -1] },
  { id: 'electronic', name: 'Electrónica', gains: [6, 3, 0, 2, 5] },
  { id: 'acoustic', name: 'Acústico', gains: [3, 1, 1, 2, 3] },
  { id: 'classical', name: 'Clásica', gains: [4, 2, -1, 2, 4] },
  { id: 'treble', name: 'Más agudos', gains: [0, 0, 0, 3, 7] },
]

interface EqState {
  enabled: boolean
  preset: string
  gains: number[]
  /** Nivela el volumen (las partes suaves se oyen más y las fuertes no saturan) */
  leveler: boolean
  /** Ventana del ecualizador abierta (no se guarda) */
  open: boolean
  /** ¿La canción que suena pasa por el ecualizador? (no se guarda) */
  applies: boolean
  setEnabled: (v: boolean) => void
  setPreset: (id: string) => void
  setGain: (band: number, db: number) => void
  setLeveler: (v: boolean) => void
  setOpen: (v: boolean) => void
  setApplies: (v: boolean) => void
}

export const useEqStore = create<EqState>()(
  persist(
    (set, get) => ({
      enabled: false,
      preset: 'flat',
      gains: [0, 0, 0, 0, 0],
      leveler: false,
      open: false,
      applies: false,
      setEnabled: (enabled) => set({ enabled }),
      setPreset: (id) => {
        const p = EQ_PRESETS.find((x) => x.id === id)
        if (p) set({ preset: id, gains: [...p.gains], enabled: true })
      },
      setGain: (band, db) => {
        const gains = [...get().gains]
        gains[band] = db
        set({ gains, preset: 'custom', enabled: true })
      },
      setLeveler: (leveler) => set({ leveler, enabled: true }),
      setOpen: (open) => set({ open }),
      setApplies: (applies) => set({ applies }),
    }),
    {
      name: 'cpn-eq',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ enabled: s.enabled, preset: s.preset, gains: s.gains, leveler: s.leveler }),
    }
  )
)
