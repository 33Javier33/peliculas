// Descargas guardadas como archivos de música del teléfono (Música/PulsoMedia/<disco>) en la app
// de Android: no se borran al desinstalar la app y, al volver a instalarla, se recuperan sin
// descargar nada. El nombre de cada archivo lleva la clave de su canción: «Título [pm-CLAVE].m4a».
import { getNative } from '@/lib/native'

interface PhoneBridge {
  phoneStorage?: () => boolean
  storeDownload?: (req: string, src: string, name: string, folder: string, ext: string) => void
  listStored?: () => string
  deleteStored?: (id: string) => void
  audioPermission?: () => string
  askAudioPermission?: () => void
  audioBase: () => string
}
const bridge = () => getNative() as unknown as PhoneBridge | null

export const phoneStorageAvailable = () => {
  try {
    return !!bridge()?.phoneStorage?.()
  } catch {
    return false
  }
}

const b64 = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64 = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))))

/** Nombre del archivo: el título y la clave de la canción */
export const fileNameFor = (title: string, key: string) => `${title.slice(0, 120)} [pm-${b64(key)}]`

/** Clave y título de un archivo «Título [pm-CLAVE].ext» */
export function parseFileName(name: string): { key: string; title: string } | null {
  const m = name.match(/^(.*?)\s*\[pm-([A-Za-z0-9_-]+)\]\.[a-z0-9]+$/i)
  if (!m) return null
  try {
    return { key: unb64(m[2]), title: m[1].trim() }
  } catch {
    return null
  }
}

export const phoneAudioUrl = (id: number) => `${bridge()?.audioBase()}/m/${id}`

// Respuestas de Android (descarga terminada, avance)
const pending = new Map<string, { resolve: (r: { id: number; size: number }) => void; reject: (e: Error) => void; progress: (f: number, bytes?: number) => void }>()
if (typeof window !== 'undefined') {
  const w = window as unknown as Record<string, unknown>
  w.__cpnStored = (json: string) => {
    const o = JSON.parse(json) as { req: string; ok: boolean; id?: number; size?: number; error?: string }
    const p = pending.get(o.req)
    if (!p) return
    pending.delete(o.req)
    if (o.ok && o.id) p.resolve({ id: o.id, size: o.size ?? 0 })
    else p.reject(new Error(o.error || 'No se pudo guardar'))
  }
  w.__cpnStoredProgress = (json: string) => {
    const o = JSON.parse(json) as { req: string; f: number; b?: number }
    pending.get(o.req)?.progress(o.f, o.b)
  }
}

/** Descarga `src` y la guarda en Música/PulsoMedia/<folder> */
export function storeOnPhone(key: string, src: string, title: string, folder: string, ext: string, onProgress: (f: number, bytes?: number) => void, signal?: AbortSignal): Promise<{ id: number; size: number }> {
  return new Promise((resolve, reject) => {
    const b = bridge()
    if (!b?.storeDownload) return reject(new Error('Sin almacenamiento del teléfono'))
    const req = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
    pending.set(req, { resolve, reject, progress: onProgress })
    signal?.addEventListener('abort', () => {
      pending.delete(req)
      reject(Object.assign(new Error('cancelada'), { name: 'AbortError' }))
    })
    b.storeDownload(req, src, fileNameFor(title, key), folder || 'Canciones sueltas', ext)
  })
}

export function deleteFromPhone(id: number) {
  try {
    bridge()?.deleteStored?.(String(id))
  } catch {}
}

export interface PhoneFile {
  id: number
  name: string
  folder: string
  size: number
}

/** Lo que hay guardado en el teléfono; null si falta el permiso para verlo */
export function listPhone(): PhoneFile[] | null {
  const b = bridge()
  if (!b?.listStored) return []
  if (b.audioPermission?.() === 'needed') return null
  try {
    const r = b.listStored()
    return r === 'denied' ? null : (JSON.parse(r) as PhoneFile[])
  } catch {
    return []
  }
}

/** Pide el permiso de música (para recuperar las descargas tras reinstalar) */
export function askPhonePermission(): Promise<boolean> {
  return new Promise((resolve) => {
    const b = bridge()
    if (!b?.askAudioPermission) return resolve(false)
    if (b.audioPermission?.() === 'granted') return resolve(true)
    ;(window as unknown as Record<string, unknown>).__cpnPerm = (ok: boolean) => resolve(!!ok)
    b.askAudioPermission()
  })
}
