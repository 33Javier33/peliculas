// Calidad del audio que se descarga: «max» usa el mejor archivo disponible (FLAC o MP3 320 de
// archive.org, la mejor pista de YouTube); «normal» la copia liviana (ocupa menos espacio).
const KEY = 'cpn-dl-quality'
export type DownloadQuality = 'max' | 'normal'

export function getDownloadQuality(): DownloadQuality {
  try {
    return localStorage.getItem(KEY) === 'normal' ? 'normal' : 'max'
  } catch {
    return 'max'
  }
}

export function setDownloadQuality(q: DownloadQuality) {
  try {
    localStorage.setItem(KEY, q)
  } catch {}
}

export const isArchiveFile = (u?: string) => !!u && /^https:\/\/([a-z0-9-]+\.)*archive\.org\/download\//i.test(u)

/** El mejor archivo de esa canción de archive.org (o la misma dirección si no hay otro) */
export async function bestSourceFor(url: string): Promise<string> {
  if (!isArchiveFile(url)) return url
  const d = (await fetch(`/api/archive-best?json=1&u=${encodeURIComponent(url)}`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)) as { url?: string } | null
  return d?.url || url
}
