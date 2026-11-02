// Radio de Internet Archive (lado del teléfono): pide canciones por género y las deja listas para
// el reproductor. La cola se rellena sola antes de terminar (ver MusicPlayerBar).
import type { MusicVideo } from '@/lib/youtube-music'
import { toEntries, type ApiAlbum } from '@/lib/link-albums'
import { librarySongsFor, classifyLibrary } from '@/lib/library-radio'
import { useMusicStore } from '@/store/musicStore'

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
  // Se empieza a averiguar ya los géneros de tu biblioteca (mientras llega la tanda); cada artista
  // reconocido suma sus canciones a lo que falta por sonar (ver watchLibraryGenres)
  watchLibraryGenres()
  classifyLibrary().catch(() => {})
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
  return mixed
}

let watching = false
let pending: ReturnType<typeof setTimeout> | null = null
/** Al conocerse el género de más artistas de tu biblioteca, se suman a la radio que suena */
function watchLibraryGenres() {
  if (watching || typeof window === 'undefined') return
  watching = true
  window.addEventListener('cpn-genres', () => {
    if (pending) return
    pending = setTimeout(() => {
      pending = null
      const st = useMusicStore.getState()
      const genre = (st.queue[st.currentIndex] as { archiveRadio?: string } | undefined)?.archiveRadio
      if (genre) injectLibrarySongs(genre)
    }, 3000)
  })
}

/**
 * Canciones de tu biblioteca que se reconocieron después de armar la tanda (los géneros se
 * averiguan de a poco): se intercalan en lo que falta por sonar, una cada tres o cuatro.
 */
export function injectLibrarySongs(genre: string) {
  const st = useMusicStore.getState()
  const cur = st.queue[st.currentIndex] as (MusicVideo & { archiveRadio?: string }) | undefined
  if (!cur || cur.archiveRadio !== genre) return 0 // ya no suena esta radio
  const upcoming = st.queue.slice(st.currentIndex + 1)
  const already = upcoming.filter((t) => (t as { fromLibrary?: boolean }).fromLibrary).length
  const want = Math.floor(upcoming.length / 4) - already
  if (want <= 0) return 0
  const mine = librarySongsFor(genre, want, new Set(st.queue.map((t) => t.id))).map((t) => ({ ...t, archiveRadio: genre, fromLibrary: true }))
  if (!mine.length) return 0
  const next: MusicVideo[] = []
  let k = 0
  upcoming.forEach((t, i) => {
    next.push(t)
    if (i % 4 === 1 && k < mine.length) next.push(mine[k++])
  })
  useMusicStore.setState({ queue: [...st.queue.slice(0, st.currentIndex + 1), ...next] })
  return k
}
