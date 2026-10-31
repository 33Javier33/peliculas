import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

// Cuenta (opcional): correo con el que se inició sesión, su token y cuándo se sincronizó
interface AccountState {
  email: string | null
  token: string | null
  /** Fecha del último respaldo conocido (del servidor) */
  syncedAt: number
  /** Estado para mostrar: 'idle' | 'syncing' | 'error' (no se guarda) */
  status: 'idle' | 'syncing' | 'error'
  open: boolean
  setSession: (email: string, token: string) => void
  setSyncedAt: (t: number) => void
  setStatus: (s: AccountState['status']) => void
  setOpen: (v: boolean) => void
  clear: () => void
}

export const useAccountStore = create<AccountState>()(
  persist(
    (set) => ({
      email: null,
      token: null,
      syncedAt: 0,
      status: 'idle',
      open: false,
      setSession: (email, token) => set({ email, token, syncedAt: 0 }),
      setSyncedAt: (syncedAt) => set({ syncedAt }),
      setStatus: (status) => set({ status }),
      setOpen: (open) => set({ open }),
      clear: () => set({ email: null, token: null, syncedAt: 0, status: 'idle' }),
    }),
    {
      name: 'cpn-account',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ email: s.email, token: s.token, syncedAt: s.syncedAt }),
    }
  )
)
