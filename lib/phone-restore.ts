// Recuperar las descargas guardadas en el teléfono (tras reinstalar la app) y mostrarlas en la
// biblioteca, agrupadas por su disco (la carpeta de Música/PulsoMedia).
import type { MusicVideo } from '@/lib/youtube-music'
import { useOfflineStore } from '@/store/offlineStore'
import { useLinksStore } from '@/store/linksStore'
import { useMusicStore } from '@/store/musicStore'

export async function restoreDownloads(): Promise<number | null> {
  const n = await useOfflineStore.getState().restoreFromPhone()
  if (n === null) return null
  if (n > 0) {
    // Las que ya están en la biblioteca (p. ej. bajadas por la otra app —PulsoMedia/PulsoMusic— o
    // traídas con la cuenta) quedan con su disco de siempre: no se crean discos repetidos
    const links = useLinksStore.getState()
    const music = useMusicStore.getState()
    const known = new Map<string, { track: MusicVideo; groupId: string; groupTitle: string; cover?: string }>()
    for (const a of links.albums)
      for (const id of a.trackIds) {
        const t = links.tracks.find((x) => x.id === id)
        if (t?.audioUrl) known.set(t.audioUrl, { track: t, groupId: a.id, groupTitle: a.title, cover: a.cover })
      }
    for (const a of music.savedAlbums)
      for (const t of a.tracks) if (/^[A-Za-z0-9_-]{11}$/.test(t.id)) known.set(`/api/stream?id=${t.id}`, { track: t, groupId: a.id, groupTitle: a.title, cover: a.cover })
    for (const t of music.saved) if (/^[A-Za-z0-9_-]{11}$/.test(t.id) && !known.has(`/api/stream?id=${t.id}`)) known.set(`/api/stream?id=${t.id}`, { track: t, groupId: 'me-gusta', groupTitle: 'Me gusta' })
    useOfflineStore.setState((st) => {
      const items = { ...st.items }
      for (const it of Object.values(items)) {
        if (!it.groupId.startsWith('telefono-')) continue
        const k = known.get(it.key)
        if (k) items[it.key] = { ...it, track: { ...k.track, audioUrl: k.track.audioUrl ?? it.key }, groupId: k.groupId, groupTitle: k.groupTitle, groupCover: k.cover ?? it.groupCover }
      }
      return { items }
    })
    // Las demás: cada carpeta (disco) vuelve a la biblioteca como un disco guardado
    const byGroup = new Map<string, { title: string; cover?: string; tracks: MusicVideo[] }>()
    for (const it of Object.values(useOfflineStore.getState().items)) {
      if (!it.groupId.startsWith('telefono-')) continue
      const g = byGroup.get(it.groupId) ?? { title: it.groupTitle, cover: it.groupCover, tracks: [] }
      g.tracks.push(it.track)
      byGroup.set(it.groupId, g)
    }
    for (const [id, g] of Array.from(byGroup.entries()))
      links.addAlbum({ id, title: g.title, artist: g.tracks[0]?.channelTitle || '', cover: g.cover, source: 'telefono', description: 'Recuperado de la música del teléfono' }, g.tracks)
    useOfflineStore.getState().notify(`✓ ${n} descargas recuperadas de la música del teléfono`)
  }
  return n
}
