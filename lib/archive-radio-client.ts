// Radio de Internet Archive (lado del teléfono): pide canciones por género y las deja listas para
// el reproductor. La cola se rellena sola antes de terminar (ver MusicPlayerBar).
import type { MusicVideo } from '@/lib/youtube-music'
import { toEntries, type ApiAlbum } from '@/lib/link-albums'
import { librarySongsFor, classifyLibrary } from '@/lib/library-radio'

export interface RadioGenreInfo {
  id: string
  label: string
  icon: string
  color: string
}

/** Identificador del disco de archive.org de una canción (de su dirección /download/ID/…) */
export function archiveItemOf(t: MusicVideo): string | null {
  const m = (t.description || t.audioUrl || '').match(/\/download\/([^/?#]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

/** Próximas canciones de la radio de un género (sin repetir los discos que ya sonaron) */
export async function fetchRadioTracks(genre: string, played: MusicVideo[] = []): Promise<MusicVideo[]> {
  const skip = Array.from(new Set(played.map(archiveItemOf).filter((x): x is string => !!x))).slice(-150)
  const params = new URLSearchParams({ genre })
  if (skip.length) params.set('skip', skip.join(','))
  const r = await fetch(`/api/archive-radio?${params}`)
  const d = (await r.json().catch(() => ({}))) as { albums?: ApiAlbum[] }
  const tracks = (d.albums ?? []).flatMap((a) => toEntries(a).tracks).map((t) => ({ ...t, archiveRadio: genre }))
  // Mezcladas: cada canción de un disco distinto en lo posible
  for (let i = tracks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[tracks[i], tracks[j]] = [tracks[j], tracks[i]]
  }
  // De tu biblioteca, del mismo género: una cada tres o cuatro canciones de archive.org
  const inQueue = new Set(played.map((t) => t.id))
  const mine = librarySongsFor(genre, Math.max(1, Math.floor(tracks.length / 4)), inQueue).map((t) => ({ ...t, archiveRadio: genre, fromLibrary: true }))
  const mixed: MusicVideo[] = []
  let k = 0
  tracks.forEach((t, i) => {
    mixed.push(t)
    if (i % 4 === 2 && k < mine.length) mixed.push(mine[k++])
  })
  // Sigue conociendo los géneros de tu biblioteca (para las próximas tandas)
  classifyLibrary().catch(() => {})
  return mixed
}
