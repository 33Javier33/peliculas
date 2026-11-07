import { nativeAudioUrl } from '@/lib/native'
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
  // Audio convertido de YouTube (por el servidor de la app): por partes, así una canción larga
  // no se corta por el límite de tiempo del servidor
  if (url.startsWith('/api/stream?')) return downloadInParts(url, onProgress, signal)
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

const PART = 6 * 1024 * 1024

/**
 * Audio de YouTube por partes. En la app de Android se saca del propio teléfono (su servidor local:
 * YouTube no lo bloquea); si no, por el servidor de la app.
 */
async function downloadInParts(url: string, onProgress: (f: number) => void, signal?: AbortSignal): Promise<Blob> {
  const id = new URLSearchParams(url.split('?')[1] || '').get('id') || ''
  const local = nativeAudioUrl(id)
  const sources: ((from: number) => [string, RequestInit])[] = []
  if (local) sources.push((from) => [`${local}?bg=1`, { headers: { Range: `bytes=${from}-${from + PART - 1}` } }])
  sources.push((from) => [url, { headers: { Range: `bytes=${from}-${from + PART - 1}` } }])
  let lastError: unknown
  for (const src of sources) {
    try {
      return await readParts(src, onProgress, signal)
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err
      lastError = err
    }
  }
  throw lastError instanceof Error ? lastError : new Error('No se pudo convertir')
}

async function readParts(src: (from: number) => [string, RequestInit], onProgress: (f: number) => void, signal?: AbortSignal): Promise<Blob> {
  const chunks: Uint8Array[] = []
  let got = 0
  let total = 0
  let type = 'audio/mp4'
  for (let tries = 0; ; ) {
    const [u, init] = src(got)
    const res = await fetch(u, { ...init, signal, cache: 'no-store' }).catch((e) => {
      if ((e as Error).name === 'AbortError') throw e
      return null
    })
    if (!res || (!res.ok && res.status !== 206)) {
      // Sin tamaño total conocido: pedir más allá del final da error → ya llegó todo
      if (got && !total) break
      // Al comienzo sin respuesta: se pasa a la otra fuente; a mitad, se reintenta unas veces
      if (!got || ++tries > 3) throw new Error(`No se pudo convertir${res ? ` (HTTP ${res.status})` : ''}`)
      await new Promise((r) => setTimeout(r, 1500 * tries))
      continue
    }
    type = (res.headers.get('content-type') || type).split(';')[0]
    const buf = new Uint8Array(await res.arrayBuffer())
    chunks.push(buf)
    got += buf.length
    const range = res.headers.get('content-range')
    total = Number(range?.split('/')[1]) || (res.status === 200 ? got : total)
    if (total) onProgress(Math.min(1, got / total))
    // Respuesta completa, sin más datos o ya llegó todo
    if (res.status === 200 || !buf.length || (total && got >= total)) break
    // Sin tamaño total: una parte más corta que lo pedido es la última
    if (!total && buf.length < PART) break
    // Sin tamaño total: se sigue hasta que una parte llegue vacía (máx. 200 MB)
    if (got > 200 * 1024 * 1024) break
  }
  if (got < 1024) throw new Error('Archivo vacío')
  return new Blob(chunks as BlobPart[], { type: type.startsWith('audio') ? type : 'audio/mp4' })
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

/** Tamaño de cada parte de un video descargado (se guarda por partes: se puede retomar) */
export const VIDEO_PART = 8 * 1024 * 1024
export const partKey = (key: string, i: number) => `${key}#${i}`

/**
 * Descarga un video grande por partes de 8 MB directo al almacenamiento del teléfono (no queda
 * entero en la memoria). Si se corta, sigue desde la última parte guardada.
 */
export async function downloadVideoParts(
  url: string,
  key: string,
  fromPart: number,
  onPart: (parts: number, bytes: number, total: number) => void,
  signal?: AbortSignal
): Promise<{ parts: number; size: number; mime: string }> {
  let start = fromPart * VIDEO_PART
  const res = await fetch(url, { signal, cache: 'no-store', headers: start > 0 ? { Range: `bytes=${start}-` } : {} })
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
  // El sitio no aceptó seguir desde la mitad: se empieza de nuevo
  if (start > 0 && res.status !== 206) start = 0
  let part = Math.floor(start / VIDEO_PART)
  const range = res.headers.get('content-range')?.match(/\/(\d+)$/)
  const total = range ? Number(range[1]) : start + (Number(res.headers.get('content-length')) || 0)
  const mime = (res.headers.get('content-type') || 'video/mp4').split(';')[0]
  const reader = res.body.getReader()
  let buf: Uint8Array[] = []
  let bufLen = 0
  let got = start
  const flush = async () => {
    if (!bufLen) return
    await putFile(partKey(key, part), new Blob(buf as BlobPart[], { type: mime }))
    part++
    buf = []
    bufLen = 0
    onPart(part, got, total)
  }
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    let v = value
    while (v.length) {
      const room = VIDEO_PART - bufLen
      const take = v.subarray(0, room)
      buf.push(take)
      bufLen += take.length
      got += take.length
      v = v.subarray(take.length)
      if (bufLen >= VIDEO_PART) await flush()
    }
  }
  // Se cortó antes de terminar: la parte a medias no se guarda y se retoma desde la anterior
  if (total && got < total) throw new Error('Descarga incompleta')
  await flush()
  if (got < 100 * 1024) throw new Error('Archivo vacío')
  return { parts: part, size: got, mime }
}

/** Arma el video guardado por partes (lo lee el reproductor sin copiarlo a la memoria) */
export async function getVideoParts(key: string, parts: number, mime: string): Promise<Blob | null> {
  const list: Blob[] = []
  for (let i = 0; i < parts; i++) {
    const b = await getFile(partKey(key, i))
    if (!b) return null
    list.push(b)
  }
  return new Blob(list, { type: mime })
}

export async function deleteVideoParts(key: string, parts: number) {
  // Se borran también las partes de más que hayan quedado de un intento cortado
  for (let i = 0; i < parts + 2; i++) await deleteFile(partKey(key, i)).catch(() => {})
}
