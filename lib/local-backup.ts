// Respaldo automático de la biblioteca en el teléfono (app de Android): playlists, Me gusta,
// álbumes, discos, artistas seguidos, radios y videos guardados. Queda en
// Descargas/PulsoMedia/PulsoMedia-respaldo.json, que NO se borra al desinstalar la app.
import { getNative } from '@/lib/native'
import { useMusicStore } from '@/store/musicStore'
import { snapshot, apply, merge, BACKED_STORES, type Backup } from '@/lib/account-sync'

const DELAY = 15000

function hasContent(b: Backup) {
  return !!(b.playlists?.length || b.saved?.length || b.albums?.length || b.links?.albums?.length || b.follow?.length || b.radios?.length || b.videos?.liked?.length)
}

/** Empieza a respaldar sola cada cambio (a los 15 s) y al salir de la app. Devuelve cómo pararlo. */
export function startPhoneBackup(): () => void {
  const n = getNative()
  if (!n?.saveBackup) return () => {}
  let timer: ReturnType<typeof setTimeout> | undefined
  let last = ''
  const save = () => {
    clearTimeout(timer)
    timer = undefined
    // Todavía se está cargando la biblioteca: se espera (si no, el respaldo saldría incompleto)
    if (!useMusicStore.getState().hasHydrated) {
      timer = setTimeout(save, 3000)
      return
    }
    const b = snapshot()
    // Biblioteca vacía (p. ej. recién reinstalada): no se escribe nada
    if (!hasContent(b)) return
    const json = JSON.stringify(b)
    if (json === last) return
    try {
      if (n.saveBackup!(JSON.stringify({ ...b, app: 'PulsoMedia', at: Date.now() }))) last = json
    } catch {}
  }
  // (El reproductor cambia su estado varias veces por segundo: no se reinicia la espera, se
  // respalda a los 15 s del primer cambio y solo si algo guardado cambió)
  const schedule = () => {
    if (!timer) timer = setTimeout(save, DELAY)
  }
  const unsubs = BACKED_STORES.map((s) => (s as unknown as { subscribe: (fn: () => void) => () => void }).subscribe(schedule))
  const onVis = () => document.visibilityState === 'hidden' && save()
  document.addEventListener('visibilitychange', onVis)
  timer = setTimeout(save, 8000)
  return () => {
    clearTimeout(timer)
    unsubs.forEach((u) => u())
    document.removeEventListener('visibilitychange', onVis)
  }
}

/** Recupera un archivo de respaldo (se junta con lo que ya hay, sin perder nada). Devuelve qué volvió. */
export async function restoreBackupFile(file: File): Promise<{ playlists: number; songs: number; albums: number }> {
  const data = JSON.parse(await file.text()) as Backup
  if (!data || data.v !== 1 || !Array.isArray(data.playlists)) throw new Error('Ese archivo no es un respaldo de PulsoMedia')
  apply(merge(snapshot(), data))
  return { playlists: data.playlists.length, songs: data.saved?.length ?? 0, albums: (data.albums?.length ?? 0) + (data.links?.albums?.length ?? 0) }
}
