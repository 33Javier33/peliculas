import { isNativeApp, nativeAudioUrl } from '@/lib/native'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { MusicVideo } from '@/lib/youtube-music'
import { downloadAudio, putFile, deleteFile, persistStorage, getFile } from '@/lib/offline-files'
import { getDownloadQuality, bestSourceFor, isArchiveFile } from '@/lib/audio-quality'
import { phoneStorageAvailable, storeOnPhone, deleteFromPhone, listPhone, parseFileName } from '@/lib/phone-storage'

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
  /** App de Android: guardada como música del teléfono (Música/PulsoMedia), no se borra al desinstalar */
  phoneId?: number
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
  /** App de Android: lo descargado dentro de la app pasa a la música del teléfono (no se pierde al desinstalar) */
  migrateToPhone: () => Promise<void>
  /** Tras reinstalar: recupera lo guardado en Música/PulsoMedia (null = falta el permiso) */
  restoreFromPhone: () => Promise<number | null>
}

const controllers = new Map<string, AbortController>()

/** Canción a partir de su clave (al recuperar un archivo guardado en el teléfono) */
function trackFromKey(key: string, title: string, folder: string): MusicVideo {
  const yt = key.match(/^\/api\/stream\?id=([A-Za-z0-9_-]{11})/)
  const m = title.match(/^(.+?)\s[-–—]\s(.+)$/)
  const artist = m ? m[1] : ''
  const archive = key.match(/archive\.org\/download\/([^/]+)\//)
  return {
    id: yt ? `yta-${yt[1]}` : `link-${hashKey(key)}`,
    title,
    channelTitle: artist,
    artist: artist || undefined,
    thumbnail: yt ? `https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg` : archive ? `https://archive.org/services/img/${archive[1]}` : '/icons/icon-512.png',
    publishedAt: '',
    description: yt ? `https://www.youtube.com/watch?v=${yt[1]}` : key,
    album: folder || undefined,
    audioUrl: key,
  } as MusicVideo
}
function hashKey(s: string) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/** De dónde se descarga cada canción (en la app de Android, el audio de YouTube sale del teléfono) */
async function sourceFor(key: string, max: boolean): Promise<string> {
  const yt = key.match(/^\/api\/stream\?id=([A-Za-z0-9_-]{11})/)
  // (?bg=1: el teléfono la busca con prioridad baja, sin frenar la canción que suena)
  if (yt) return (nativeAudioUrl(yt[1]) && `${nativeAudioUrl(yt[1])}?bg=1`) || `${window.location.origin}${key}`
  if (isArchiveFile(key)) return max ? await bestSourceFor(key) : key
  return /^https?:\/\//.test(key) ? key : `${window.location.origin}${key}`
}
const extOf = (key: string, src: string) =>
  key.startsWith('/api/stream?') ? 'm4a' : (src.split('?')[0].match(/\.(mp3|flac|ogg|oga|opus|m4a|aac|wav)$/i)?.[1] || 'mp3').toLowerCase()

/**
 * Guarda una canción. App de Android: como archivo de música del teléfono (no se borra al
 * desinstalar la app). Navegador: dentro de la app (IndexedDB).
 */
async function saveAudio(key: string, title: string, folder: string, max: boolean, onProgress: (f: number) => void, signal: AbortSignal): Promise<{ size: number; phoneId?: number }> {
  if (phoneStorageAvailable()) {
    const src = await sourceFor(key, max)
    const r = await storeOnPhone(key, src, title, folder, extOf(key, src), onProgress, signal).catch((e) => {
      if ((e as Error).name === 'AbortError' || src === key || !isArchiveFile(key)) throw e
      return storeOnPhone(key, key, title, folder, extOf(key, key), onProgress, signal)
    })
    return { size: r.size, phoneId: r.id }
  }
  const src = max ? await bestSourceFor(key) : key
  const blob = await downloadAudio(src, onProgress, signal).catch((e) => {
    if ((e as Error).name === 'AbortError' || src === key) throw e
    return downloadAudio(key, onProgress, signal)
  })
  await putFile(key, blob)
  return { size: blob.size }
}

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
        // Ya se está descargando este grupo (p. ej. «Convertidas de YouTube» al bajar varios videos
        // seguidos): las nuevas se suman a la descarga en curso (antes se ignoraban)
        if (controllers.has(group.id)) {
          if (!list.length) return
          set((s) => {
            const q = s.queue[group.id]
            const have = new Set((q?.tracks ?? []).map((t) => t.audioUrl))
            const merged = [...(q?.tracks ?? []), ...list.filter((t) => !have.has(t.audioUrl))]
            const prog = s.progress[group.id]
            return {
              queue: { ...s.queue, [group.id]: { group: q?.group ?? group, tracks: merged } },
              progress: prog ? { ...s.progress, [group.id]: { ...prog, total: merged.length } } : s.progress,
            }
          })
          return
        }
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
        // De a una canción (no satura la conexión y se puede cancelar). Se toma la siguiente de la
        // cola en cada vuelta: así entran las que se agregaron mientras tanto
        const tried = new Set<string>()
        for (;;) {
          const t = (get().queue[group.id]?.tracks ?? list).find((x) => !tried.has(x.audioUrl!) && !get().items[x.audioUrl!])
          if (!t) break
          tried.add(t.audioUrl!)
          if (ctrl.signal.aborted) break
          try {
            // Máxima calidad: el mejor archivo de esa canción (FLAC / MP3 320 en archive.org)
            const max = getDownloadQuality() === 'max'
            const saved = await saveAudio(t.audioUrl!, t.title, group.title, max, (f) => setProg({ current: f }), ctrl.signal)
            set((s) => ({
              items: {
                ...s.items,
                [t.audioUrl!]: {
                  key: t.audioUrl!,
                  track: t,
                  groupId: group.id,
                  groupTitle: group.title,
                  groupCover: group.cover,
                  size: saved.size,
                  savedAt: Date.now(),
                  hq: max,
                  phoneId: saved.phoneId,
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
            // Se reemplaza recién cuando la nueva está completa (si falla, queda la anterior)
            const saved = await saveAudio(it.key, it.track.title, it.groupTitle, true, (f) => setProg({ current: f }), ctrl.signal)
            if (it.phoneId && saved.phoneId !== it.phoneId) deleteFromPhone(it.phoneId)
            if (saved.phoneId && !it.phoneId) deleteFile(it.key).catch(() => {})
            set((s) => ({ items: { ...s.items, [it.key]: { ...s.items[it.key], size: saved.size, hq: true, phoneId: saved.phoneId } } }))
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
      migrateToPhone: async () => {
        const id = 'pasar-al-telefono'
        if (!phoneStorageAvailable() || controllers.has(id)) return
        const list = Object.values(get().items).filter((i) => !i.phoneId)
        if (!list.length) return
        const ctrl = new AbortController()
        controllers.set(id, ctrl)
        get().notify(`Guardando ${list.length} descargas en la música del teléfono (así no se pierden si reinstalas la app)…`)
        let done = 0
        for (const it of list) {
          if (ctrl.signal.aborted || !navigator.onLine) break
          try {
            const saved = await saveAudio(it.key, it.track.title, it.groupTitle, !!it.hq, () => {}, ctrl.signal)
            await deleteFile(it.key).catch(() => {})
            set((s) => ({ items: { ...s.items, [it.key]: { ...s.items[it.key], size: saved.size, phoneId: saved.phoneId } } }))
            done++
          } catch (err) {
            if ((err as Error).name === 'AbortError') break
          }
        }
        controllers.delete(id)
        if (done) get().notify(`✓ ${done} descargas guardadas en Música/PulsoMedia`)
      },
      restoreFromPhone: async () => {
        const files = listPhone()
        if (files === null) return null
        const items = { ...get().items }
        const byKey = new Map(Object.values(items).map((i) => [i.key, i]))
        let added = 0
        for (const f of files) {
          const info = parseFileName(f.name)
          if (!info) continue
          const prev = byKey.get(info.key)
          if (prev?.phoneId === f.id) continue
          const track = trackFromKey(info.key, info.title, f.folder)
          items[info.key] = {
            key: info.key,
            track: prev?.track ?? track,
            groupId: prev?.groupId ?? `telefono-${f.folder || 'sueltas'}`,
            groupTitle: prev?.groupTitle ?? (f.folder || 'Canciones sueltas'),
            groupCover: prev?.groupCover ?? track.thumbnail,
            size: f.size,
            savedAt: prev?.savedAt ?? Date.now(),
            hq: true,
            phoneId: f.id,
          }
          if (!prev) added++
        }
        set({ items })
        return added
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
        for (const k of keys) {
          const id = get().items[k]?.phoneId
          if (id) deleteFromPhone(id)
        }
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
