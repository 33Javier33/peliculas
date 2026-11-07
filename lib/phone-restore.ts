// Recuperar las descargas guardadas en el teléfono (tras reinstalar la app) y mostrarlas en la
// biblioteca, agrupadas por su disco (la carpeta de Música/PulsoMedia).
import type { MusicVideo } from '@/lib/youtube-music'
import { useOfflineStore } from '@/store/offlineStore'
import { useLinksStore } from '@/store/linksStore'

export async function restoreDownloads(): Promise<number | null> {
  const n = await useOfflineStore.getState().restoreFromPhone()
  if (n === null) return null
  if (n > 0) {
    // Cada carpeta (disco) vuelve a la biblioteca como un disco guardado
    const byGroup = new Map<string, { title: string; cover?: string; tracks: MusicVideo[] }>()
    for (const it of Object.values(useOfflineStore.getState().items)) {
      if (!it.groupId.startsWith('telefono-')) continue
      const g = byGroup.get(it.groupId) ?? { title: it.groupTitle, cover: it.groupCover, tracks: [] }
      g.tracks.push(it.track)
      byGroup.set(it.groupId, g)
    }
    const links = useLinksStore.getState()
    for (const [id, g] of Array.from(byGroup.entries()))
      links.addAlbum({ id, title: g.title, artist: g.tracks[0]?.channelTitle || '', cover: g.cover, source: 'telefono', description: 'Recuperado de la música del teléfono' }, g.tracks)
    useOfflineStore.getState().notify(`✓ ${n} descargas recuperadas de la música del teléfono`)
  }
  return n
}
