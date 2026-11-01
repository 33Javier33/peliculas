import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { MusicVideo } from '@/lib/youtube-music'
import { downloadAudio, putFile, deleteFile, persistStorage } from '@/lib/offline-files'

// Descargas para escuchar sin conexión. Cada canción descargada recuerda su grupo (disco o
// playlist) para mostrarlas juntas en "Descargadas". Los archivos están en lib/offline-files.

export interface OfflineItem {
  /** Dirección del audio (la misma con la que suena en línea) */
  key: string
  track: MusicVideo
  groupId: string
  groupTitle: string
  groupCover?: string
  size: number
  savedAt: number
}

export interface OfflineProgress {
  done: number
  total: number
  /** Avance de la canción que se está descargando (0..1) */
  current: number
  failed: number
}

/** ¿Se puede descargar? (archivos de audio: discos de archive.org y enlaces MP3; no YouTube) */
export const canDownload = (t: MusicVideo) => !!t.audioUrl && !t.streamUrl

interface OfflineState {
  items: Record<string, OfflineItem>
  progress: Record<string, OfflineProgress>
  download: (group: { id: string; title: string; cover?: string }, tracks: MusicVideo[]) => Promise<void>
  cancel: (groupId: string) => void
  removeGroup: (groupId: string) => Promise<void>
  removeKeys: (keys: string[]) => Promise<void>
}

const controllers = new Map<string, AbortController>()

export const useOfflineStore = create<OfflineState>()(
  persist(
    (set, get) => ({
      items: {},
      progress: {},
      download: async (group, tracks) => {
        const list = tracks.filter((t) => canDownload(t) && !get().items[t.audioUrl!])
        if (!list.length || controllers.has(group.id)) return
        await persistStorage()
        const ctrl = new AbortController()
        controllers.set(group.id, ctrl)
        const setProg = (p: Partial<OfflineProgress>) =>
          set((s) => ({ progress: { ...s.progress, [group.id]: { ...(s.progress[group.id] ?? { done: 0, total: list.length, current: 0, failed: 0 }), ...p } } }))
        setProg({ done: 0, total: list.length, current: 0, failed: 0 })
        let done = 0
        let failed = 0
        // De a una canción (no satura la conexión y se puede cancelar)
        for (const t of list) {
          if (ctrl.signal.aborted) break
          try {
            const blob = await downloadAudio(t.audioUrl!, (f) => setProg({ current: f }), ctrl.signal)
            await putFile(t.audioUrl!, blob)
            set((s) => ({
              items: {
                ...s.items,
                [t.audioUrl!]: {
                  key: t.audioUrl!,
                  track: t,
                  groupId: group.id,
                  groupTitle: group.title,
                  groupCover: group.cover,
                  size: blob.size,
                  savedAt: Date.now(),
                },
              },
            }))
            done++
          } catch (err) {
            if ((err as Error).name === 'AbortError') break
            failed++
          }
          setProg({ done, failed, current: 0 })
        }
        controllers.delete(group.id)
        set((s) => {
          const progress = { ...s.progress }
          delete progress[group.id]
          return { progress }
        })
      },
      cancel: (groupId) => controllers.get(groupId)?.abort(),
      removeGroup: async (groupId) => {
        const keys = Object.values(get().items)
          .filter((i) => i.groupId === groupId)
          .map((i) => i.key)
        await get().removeKeys(keys)
      },
      removeKeys: async (keys) => {
        await Promise.all(keys.map((k) => deleteFile(k).catch(() => {})))
        set((s) => {
          const items = { ...s.items }
          keys.forEach((k) => delete items[k])
          return { items }
        })
      },
    }),
    {
      name: 'cpn-offline',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ items: s.items }),
    }
  )
)
