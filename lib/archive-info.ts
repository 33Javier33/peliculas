// Datos de un disco de Internet Archive (carátula real, canciones, año) para las listas.
// Se piden una sola vez por disco y quedan en memoria.
export interface ArchiveInfo {
  cover?: string
  tracks: number
  year?: string
}

const infoCache = new Map<string, Promise<ArchiveInfo | null>>()

export function loadArchiveInfo(id: string): Promise<ArchiveInfo | null> {
  let p = infoCache.get(id)
  if (!p) {
    p = fetch(`/api/archive-audio?info=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? (r.json() as Promise<ArchiveInfo>) : null))
      .catch(() => null)
    infoCache.set(id, p)
  }
  return p
}
