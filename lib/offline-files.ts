// Audios descargados para escuchar sin conexión (discos de archive.org y enlaces MP3).
// Se guardan en el almacenamiento del teléfono (IndexedDB): suenan sin internet, con la
// pantalla bloqueada y con el ecualizador.
const DB = 'cpn-offline'
const STORE = 'files'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export const putFile = (key: string, blob: Blob) => tx('readwrite', (s) => s.put(blob, key))
export const getFile = (key: string) => tx<Blob | undefined>('readonly', (s) => s.get(key))
export const deleteFile = (key: string) => tx('readwrite', (s) => s.delete(key))

/** Descarga un audio con su progreso (0..1). Primero directo; si el sitio no lo permite, por el servidor de la app. */
export async function downloadAudio(url: string, onProgress: (f: number) => void, signal?: AbortSignal): Promise<Blob> {
  const sources = [url]
  if (/^https?:\/\//.test(url)) sources.push(`/api/link-audio?u=${encodeURIComponent(url)}`)
  let lastError: unknown
  for (const src of sources) {
    try {
      const res = await fetch(src, { signal, cache: 'no-store' })
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
      const total = Number(res.headers.get('content-length')) || 0
      const reader = res.body.getReader()
      const chunks: Uint8Array[] = []
      let got = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        got += value.length
        if (total) onProgress(Math.min(1, got / total))
      }
      if (got < 1024) throw new Error('Archivo vacío')
      return new Blob(chunks as BlobPart[], { type: res.headers.get('content-type') || 'audio/mpeg' })
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err
      lastError = err
    }
  }
  throw lastError instanceof Error ? lastError : new Error('No se pudo descargar')
}

/** Pide que el teléfono no borre las descargas cuando le falte espacio */
export async function persistStorage() {
  try {
    await navigator.storage?.persist?.()
  } catch {}
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.()
    return e ? { usage: e.usage ?? 0, quota: e.quota ?? 0 } : null
  } catch {
    return null
  }
}

export const formatSize = (bytes: number) =>
  bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : bytes >= 1024 ** 2 ? `${Math.round(bytes / 1024 ** 2)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
