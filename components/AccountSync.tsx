'use client'

import { useEffect } from 'react'
import { useAccountStore } from '@/store/accountStore'
import { useMusicStore } from '@/store/musicStore'
import { usePlaylistStore } from '@/store/playlistStore'
import { useEqStore } from '@/store/eqStore'
import { snapshot, apply, merge, callAccount, BACKED_STORES, type Backup } from '@/lib/account-sync'

// Sincroniza la biblioteca con la cuenta (solo si se inició sesión). Va en el layout.
const SAVE_DELAY = 4000
// Solo estos datos de cada tienda cuentan como cambio (no la canción que suena, ventanas abiertas…)
const WATCHED = new Map<unknown, string[]>([
  [useMusicStore, ['saved', 'audioBoost', 'radioEnabled']],
  [usePlaylistStore, ['playlists']],
  [useEqStore, ['enabled', 'preset', 'gains', 'leveler']],
])

export default function AccountSync() {
  const token = useAccountStore((s) => s.token)

  useEffect(() => {
    if (!token) return
    const acc = useAccountStore.getState()
    let applying = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let dirty = false
    let stopped = false

    const save = async () => {
      clearTimeout(timer)
      if (!dirty || stopped) return
      dirty = false
      acc.setStatus('syncing')
      const r = await callAccount<{ updatedAt?: number }>({ action: 'save', token, data: JSON.stringify(snapshot()) }).catch(() => null)
      if (r?.ok && r.updatedAt) {
        useAccountStore.getState().setSyncedAt(r.updatedAt)
        acc.setStatus('idle')
      } else if (r?.error === 'session') useAccountStore.getState().clear()
      else {
        dirty = true
        acc.setStatus('error')
      }
    }
    const schedule = () => {
      if (applying) return
      dirty = true
      clearTimeout(timer)
      timer = setTimeout(save, SAVE_DELAY)
    }

    // Traer lo respaldado: al iniciar sesión se junta con lo del teléfono; después, si otro
    // dispositivo guardó algo más nuevo, se usa eso
    const pull = async () => {
      const r = await callAccount<{ updatedAt?: number; data?: string | null }>({ action: 'load', token }).catch(() => null)
      if (!r || stopped) return
      if (!r.ok) {
        if (r.error === 'session') useAccountStore.getState().clear()
        return
      }
      const remote = r.data ? (JSON.parse(r.data) as Backup) : null
      const { syncedAt } = useAccountStore.getState()
      if (syncedAt === 0) {
        applying = true
        apply(remote ? merge(snapshot(), remote) : snapshot())
        applying = false
        dirty = true
        await save()
      } else if (remote && (r.updatedAt ?? 0) > syncedAt && !dirty) {
        applying = true
        apply(remote)
        applying = false
        useAccountStore.getState().setSyncedAt(r.updatedAt ?? Date.now())
      }
    }

    // Cambios que se respaldan (del reproductor solo lo guardado y sus ajustes, no la canción que suena)
    const unsubs = BACKED_STORES.map((store) =>
      (store as unknown as { subscribe: (fn: (s: unknown, p: unknown) => void) => () => void }).subscribe((s, p) => {
        const a = s as Record<string, unknown>
        const b = p as Record<string, unknown>
        const keys = WATCHED.get(store as unknown)
        if (keys && keys.every((k) => a[k] === b[k])) return
        schedule()
      })
    )
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') save()
      else pull()
    }
    document.addEventListener('visibilitychange', onVisibility)
    pull()
    return () => {
      stopped = true
      unsubs.forEach((u) => u())
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [token])

  return null
}
