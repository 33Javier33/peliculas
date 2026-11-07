import { isNativeApp } from '@/lib/native'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { MusicVideo } from '@/lib/youtube-music'
import { downloadAudio, putFile, deleteFile, persistStorage, getFile } from '@/lib/offline-files'
import { getDownloadQuality, bestSourceFor, isArchiveFile } from '@/lib/audio-quality'

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
  /** Descargada en la mejor calidad disponible */
  hq?: boolean
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

interface QueuedGroup {
  group: { id: string; title: string; cover?: string }
  tracks: MusicVideo[]
}

interface OfflineState {
  items: Record<string, OfflineItem>
  progress: Record<string, OfflineProgress>
  /** Descargas pendientes (se guardan: si se corta o se cierra la app, se retoman solas) */
  queue: Record<string, QueuedGroup>
  /** Aviso para mostrar ("Disco descargado", "Ya está descargada"…) */
  notice: { text: string; at: number } | null
  notify: (text: string) => void
  /** Retoma las descargas que quedaron pendientes */
  resume: () => void
  download: (group: { id: string; title: string; cover?: string }, tracks: MusicVideo[], resuming?: boolean) => Promise<void>
  cancel: (groupId: string) => void
  removeGroup: (groupId: string) => Promise<void>
  removeKeys: (keys: string[]) => Promise<void>
  /** Vuelve a descargar en la mejor calidad lo que se bajó antes en calidad normal */
  upgrade: () => Promise<void>
  /** Canciones de YouTube guardadas en Opus (en algunos teléfonos no suenan): se bajan otra vez en M4A */
  repairOpus: () => Promise<void>
}

const controllers = new Map<string, AbortController>()

export const useOfflineStore = create<OfflineState>()(
  persist(
    (set, get) => ({
      items: {},
      progress: {},
      queue: {},
      notice: null,
      notify: (text) => set({ notice: { text, at: Date.now() } }),
      resume: () => {
        for (const q of Object.values(get().queue)) get().download(q.group, q.tracks, true)
      },
      download: async (group, tracks, resuming = false) => {
        const list = tracks.filter((t) => canDownload(t) && !get().items[t.audioUrl!])
        if (controllers.has(group.id)) return
        if (!list.length) {
          if (!resuming) get().notify(tracks.some(canDownload) ? `Ya está descargado en tu teléfono: "${group.title}"` : 'Las canciones de YouTube no se pueden descargar')
          set((s) => {
            const queue = { ...s.queue }
            delete queue[group.id]
            return { queue }
          })
          return
        }
        set((s) => ({ queue: { ...s.queue, [group.id]: { group, tracks: list } } }))
        if (!resuming) get().notify(`Descargando "${group.title}"… puedes salir de la app, la descarga sigue`)
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
            // Máxima calidad: el mejor archivo de esa canción (FLAC / MP3 320 en archive.org)
            const max = getDownloadQuality() === 'max'
            const src = max ? await bestSourceFor(t.audioUrl!) : t.audioUrl!
            const blob = await downloadAudio(src, (f) => setProg({ current: f }), ctrl.signal).catch((e) => {
              if ((e as Error).name === 'AbortError' || src === t.audioUrl) throw e
              return downloadAudio(t.audioUrl!, (f) => setProg({ current: f }), ctrl.signal)
            })
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
                  hq: max,
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
        const aborted = ctrl.signal.aborted
        // Sus carátulas, guardadas para verse sin internet
        import('@/lib/cover-cache').then((m) => m.warmCovers([group.cover, ...list.map((t) => t.thumbnail)])).catch(() => {})
        set((s) => {
          const progress = { ...s.progress }
          delete progress[group.id]
          // Terminada o cancelada: sale de la cola (si se cortó por la conexión, queda para retomarla)
          const queue = { ...s.queue }
          if (aborted || failed === 0) delete queue[group.id]
          return { progress, queue }
        })
        if (!aborted)
          get().notify(
            failed
              ? group.id === 'yt-convertidas' && !isNativeApp()
                ? 'YouTube no deja convertir desde el navegador en este momento: usa la app de Android (convierte desde tu teléfono)'
                : `"${group.title}": ${done} descargadas, ${failed} no se pudieron (se reintentará al volver la conexión)`
              : `✓ "${group.title}" ya está descargado: suena sin internet`
          )
      },
      upgrade: async () => {
        const id = 'mejorar-calidad'
        if (controllers.has(id)) return
        // YouTube (ahora se elige su mejor pista) y discos de archive.org bajados antes en calidad normal
        const list = Object.values(get().items).filter((i) => !i.hq && (i.key.startsWith('/api/stream?') || isArchiveFile(i.key)))
        if (!list.length) return get().notify('Tus descargas ya están en la mejor calidad disponible')
        const ctrl = new AbortController()
        controllers.set(id, ctrl)
        get().notify(`Mejorando la calidad de ${list.length} canciones… (siguen sonando mientras tanto)`)
        let done = 0
        let failed = 0
        const setProg = (p: Partial<OfflineProgress>) =>
          set((s) => ({ progress: { ...s.progress, [id]: { ...(s.progress[id] ?? { done: 0, total: list.length, current: 0, failed: 0 }), ...p } } }))
        setProg({ done: 0, total: list.length, current: 0, failed: 0 })
        for (const it of list) {
          if (ctrl.signal.aborted) break
          try {
            const src = await bestSourceFor(it.key)
            const blob = await downloadAudio(src, (f) => setProg({ current: f }), ctrl.signal)
            // Se reemplaza recién cuando la nueva está completa (si falla, queda la anterior)
            await putFile(it.key, blob)
            set((s) => ({ items: { ...s.items, [it.key]: { ...s.items[it.key], size: blob.size, hq: true } } }))
            done++
          } catch (err) {
            if ((err as Error).name === 'AbortError') break
            failed++
          }
          setProg({ done, failed, current: 0 })
        }
        controllers.delete(id)
        set((s) => {
          const progress = { ...s.progress }
          delete progress[id]
          return { progress }
        })
        get().notify(failed ? `Calidad mejorada en ${done} canciones (${failed} quedaron como estaban)` : `✓ ${done} canciones ahora en la mejor calidad`)
      },
      repairOpus: async () => {
        const id = 'reparar-audio'
        if (controllers.has(id)) return
        const yt = Object.values(get().items).filter((i) => i.key.startsWith('/api/stream?'))
        const bad: OfflineItem[] = []
        for (const it of yt) {
          const blob = await getFile(it.key).catch(() => undefined)
          if (blob && /webm|opus/i.test(blob.type)) bad.push(it)
        }
        if (!bad.length) return
        const ctrl = new AbortController()
        controllers.set(id, ctrl)
        get().notify(`Arreglando ${bad.length} canciones descargadas para que suenen en tu teléfono…`)
        let done = 0
        for (const it of bad) {
          if (ctrl.signal.aborted) break
          try {
            const blob = await downloadAudio(it.key, () => {}, ctrl.signal)
            if (/webm|opus/i.test(blob.type)) continue
            await putFile(it.key, blob)
            set((s) => ({ items: { ...s.items, [it.key]: { ...s.items[it.key], size: blob.size } } }))
            done++
          } catch (err) {
            if ((err as Error).name === 'AbortError') break
          }
        }
        controllers.delete(id)
        if (done) get().notify(`✓ ${done} canciones descargadas arregladas`)
      },
      cancel: (groupId) => {
        controllers.get(groupId)?.abort()
        set((s) => {
          const queue = { ...s.queue }
          delete queue[groupId]
          return { queue }
        })
      },
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
      partialize: (s) => ({ items: s.items, queue: s.queue }),
    }
  )
)
