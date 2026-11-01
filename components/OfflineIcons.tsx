'use client'

import { Download, CheckCircle2, Loader2 } from 'lucide-react'
import { useOfflineStore, canDownload } from '@/store/offlineStore'
import { useLinksStore } from '@/store/linksStore'
import type { MusicVideo } from '@/lib/youtube-music'

// Íconos de descarga para listas (canciones, artistas, álbumes, playlists): muestran si ya está
// descargado y permiten descargar desde ahí. Las canciones de YouTube no se descargan (sin ícono).

/** Grupo donde queda una canción descargada sola: su disco guardado o "Canciones sueltas" */
export function songGroup(video: MusicVideo) {
  const album = useLinksStore.getState().albums.find((a) => a.trackIds.includes(video.id))
  return album ? { id: album.id, title: album.title, cover: album.cover } : { id: 'sueltas', title: 'Canciones sueltas' }
}

const btn = 'shrink-0 w-8 h-8 rounded-full flex items-center justify-center'

/** Una canción: ✓ verde si está descargada, ⬇ para descargarla */
export function TrackDownloadIcon({ track, overlay = false }: { track: MusicVideo; overlay?: boolean }) {
  const key = track.audioUrl ?? ''
  const done = useOfflineStore((s) => !!(key && s.items[key]))
  const busy = useOfflineStore((s) => Object.keys(s.progress).length > 0 && !!key && !s.items[key] && s.progress[songGroup(track).id] !== undefined)
  if (!canDownload(track)) return null
  const bg = overlay ? 'bg-black/55 backdrop-blur-md' : ''
  if (done)
    return (
      <button
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
          useOfflineStore.getState().notify('Ya está descargada en tu teléfono: suena sin internet')
        }}
        className={`${btn} ${bg} text-emerald-400`}
        title="Descargada: suena sin internet"
        aria-label="Descargada"
      >
        <CheckCircle2 className="w-4 h-4" />
      </button>
    )
  if (busy)
    return (
      <span className={`${btn} ${bg} text-violet-300`} aria-label="Descargando">
        <Loader2 className="w-4 h-4 animate-spin" />
      </span>
    )
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        useOfflineStore.getState().download(songGroup(track), [track])
      }}
      className={`${btn} ${bg} ${overlay ? 'text-white' : 'text-slate-500'} hover:text-emerald-400`}
      title="Descargar para escuchar sin internet"
      aria-label="Descargar"
    >
      <Download className="w-4 h-4" />
    </button>
  )
}

/** Cuántas de estas canciones están descargadas (solo cuenta las que se pueden descargar) */
export function useOfflineCount(tracks: MusicVideo[]) {
  const items = useOfflineStore((s) => s.items)
  const downloadable = tracks.filter(canDownload)
  return { done: downloadable.filter((t) => items[t.audioUrl!]).length, total: downloadable.length }
}

/** Un grupo (artista, álbum, playlist): ✓ si está todo descargado, avance, o ⬇ para descargar lo que falta */
export function GroupDownloadIcon({
  group,
  tracks,
  overlay = false,
}: {
  group: { id: string; title: string; cover?: string }
  tracks: MusicVideo[]
  overlay?: boolean
}) {
  const { done, total } = useOfflineCount(tracks)
  const progress = useOfflineStore((s) => s.progress[group.id])
  if (!total) return null
  const bg = overlay ? 'bg-black/55 backdrop-blur-md' : ''
  if (progress)
    return (
      <button
        onClick={(e) => {
          e.stopPropagation()
        e.preventDefault()
          useOfflineStore.getState().cancel(group.id)
        }}
        className={`${btn} ${bg} text-violet-300`}
        aria-label="Cancelar descarga"
        title={`Descargando ${progress.done + 1}/${progress.total}`}
      >
        <Loader2 className="w-4 h-4 animate-spin" />
      </button>
    )
  if (done === total)
    return (
      <button
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
          useOfflineStore.getState().notify(`Ya está descargado en tu teléfono: "${group.title}"`)
        }}
        className={`${btn} ${bg} text-emerald-400`}
        title="Todo descargado"
        aria-label="Todo descargado"
      >
        <CheckCircle2 className="w-4 h-4" />
      </button>
    )
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        useOfflineStore.getState().download(group, tracks)
      }}
      className={`${btn} ${bg} ${overlay ? 'text-white' : 'text-slate-500'} hover:text-emerald-400`}
      title={`Descargar ${total - done} ${total - done === 1 ? 'canción' : 'canciones'}`}
      aria-label={`Descargar ${group.title}`}
    >
      <Download className="w-4 h-4" />
    </button>
  )
}

/** Texto corto: "3/5 descargadas" (nada si no hay descargables) */
export function OfflineCountText({ tracks }: { tracks: MusicVideo[] }) {
  const { done, total } = useOfflineCount(tracks)
  if (!total || !done) return null
  return <span className="text-emerald-400">{done === total ? ' · descargado' : ` · ${done}/${total} descargadas`}</span>
}
