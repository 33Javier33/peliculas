'use client'
// PulsoMedia y PulsoMusic en el mismo teléfono: cada una puede traer la biblioteca de la otra
// (playlists, Me gusta, álbumes, discos, artistas, radios). Se junta con lo que ya hay, sin perder
// nada. Las descargas se comparten solas (las dos guardan en Música/PulsoMedia).
import { getNative } from '@/lib/native'
import { snapshot, apply, merge, type Backup } from '@/lib/account-sync'
import { useOfflineStore } from '@/store/offlineStore'
import { appFlavor, brandName } from '@/lib/app-flavor'

const DONE = 'cpn-sibling-imported'

export const otherAppName = () => brandName(appFlavor() === 'music' ? 'media' : 'music')

/** ¿La otra app está en este teléfono y tiene biblioteca? */
export function siblingLibrary(): Backup | null {
  const n = getNative() as unknown as { otherLibrary?: () => string } | null
  if (!n?.otherLibrary) return null
  try {
    const raw = n.otherLibrary()
    if (!raw) return null
    const b = JSON.parse(raw) as Backup
    return b && b.v === 1 ? b : null
  } catch {
    return null
  }
}

/** Trae la biblioteca de la otra app. Devuelve cuántas playlists, canciones y discos trajo (o null) */
export function importSiblingLibrary(silent = false): { playlists: number; songs: number; albums: number } | null {
  const b = siblingLibrary()
  if (!b) {
    if (!silent) useOfflineStore.getState().notify(`No se encontró ${otherAppName()} en este teléfono (o aún no tiene biblioteca: ábrela una vez)`)
    return null
  }
  const before = snapshot()
  apply(merge(before, b))
  const after = snapshot()
  const r = {
    playlists: (after.playlists?.length ?? 0) - (before.playlists?.length ?? 0),
    songs: (after.saved?.length ?? 0) - (before.saved?.length ?? 0),
    albums: (after.albums?.length ?? 0) + (after.links?.albums?.length ?? 0) - (before.albums?.length ?? 0) - (before.links?.albums?.length ?? 0),
  }
  try {
    localStorage.setItem(DONE, String(Date.now()))
  } catch {}
  const any = r.playlists + r.songs + r.albums > 0
  if (!silent || any)
    useOfflineStore.getState().notify(any ? `✓ Se trajo tu biblioteca de ${otherAppName()}: ${r.playlists} playlists, ${r.songs} Me gusta, ${r.albums} discos` : `Tu biblioteca ya está igual que en ${otherAppName()}`)
  return r
}

/** Una vez por instalación: si la otra app está en el teléfono, su biblioteca se trae sola */
export function autoImportSibling() {
  try {
    if (localStorage.getItem(DONE)) return
  } catch {
    return
  }
  if (siblingLibrary()) importSiblingLibrary(true)
}
