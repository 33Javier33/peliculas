// Música guardada en el teléfono: archivos de audio propios (MP3, M4A…) que el usuario agrega.
// Se guardan en el almacenamiento del navegador (IndexedDB), así se escuchan sin conexión y con
// la pantalla bloqueada (se reproducen con el <audio> propio de la app).
import type { MusicVideo } from '@/lib/youtube-music'

const DB = 'cpn-local-music'
const STORE = 'files'
export const LOCAL_PREFIX = 'local-'

export interface LocalTrackInfo {
  id: string
  title: string
  artist: string
  name: string
  size: number
  duration: number
  addedAt: number
}

interface LocalTrackRecord extends LocalTrackInfo {
  blob: Blob
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** "Artista - Título.mp3" → { artist, title } */
function parseName(name: string): { artist: string; title: string } {
  const base = name.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/_/g, ' ').replace(/^\d{1,3}[\s.-]+/, '').trim()
  const parts = base.split(/\s+[-–]\s+/)
  return parts.length >= 2 ? { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() } : { artist: 'Mi música', title: base }
}

function audioDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const a = new Audio()
    a.preload = 'metadata'
    a.onloadedmetadata = () => {
      resolve(isFinite(a.duration) ? a.duration : 0)
      URL.revokeObjectURL(url)
    }
    a.onerror = () => {
      resolve(0)
      URL.revokeObjectURL(url)
    }
    a.src = url
  })
}

/** Agrega archivos de audio. Devuelve cuántos se guardaron. */
export async function addLocalFiles(files: FileList | File[]): Promise<number> {
  // Pide que el navegador no borre estos archivos cuando falte espacio
  try {
    await navigator.storage?.persist?.()
  } catch {}
  let added = 0
  for (const file of Array.from(files)) {
    if (!file.type.startsWith('audio/') && !/\.(mp3|m4a|aac|ogg|opus|wav|flac|webm)$/i.test(file.name)) continue
    const { artist, title } = parseName(file.name)
    const record: LocalTrackRecord = {
      id: `${LOCAL_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      title,
      artist,
      name: file.name,
      size: file.size,
      duration: await audioDuration(file),
      addedAt: Date.now(),
      blob: file,
    }
    await tx('readwrite', (s) => s.put(record))
    added++
  }
  return added
}

export async function listLocalTracks(): Promise<LocalTrackInfo[]> {
  const all = await tx<LocalTrackRecord[]>('readonly', (s) => s.getAll())
  return all
    .map(({ blob: _blob, ...info }) => info)
    .sort((a, b) => b.addedAt - a.addedAt)
}

export async function getLocalBlob(id: string): Promise<Blob | null> {
  const rec = await tx<LocalTrackRecord | undefined>('readonly', (s) => s.get(id))
  return rec?.blob ?? null
}

export async function removeLocalTrack(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id))
}

export const isLocalTrack = (id?: string) => !!id && id.startsWith(LOCAL_PREFIX)

const fmt = (secs: number) => {
  const s = Math.round(secs)
  return s > 0 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : undefined
}

/** Pista lista para el reproductor */
export function toTrack(info: LocalTrackInfo): MusicVideo {
  return {
    id: info.id,
    title: `${info.artist} - ${info.title}`,
    channelTitle: info.artist,
    thumbnail: '/icons/icon-512.png',
    publishedAt: '',
    description: 'En este teléfono',
    duration: fmt(info.duration),
  }
}
