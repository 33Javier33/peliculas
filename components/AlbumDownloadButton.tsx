'use client'

import { useState } from 'react'
import { Download, Loader2, CheckCircle2 } from 'lucide-react'
import type { MusicVideo } from '@/lib/youtube-music'
import { useOfflineStore } from '@/store/offlineStore'
import { useLinksStore } from '@/store/linksStore'
import { downloadCatalogAlbum, albumKey } from '@/lib/yt-convert'

// Descargar un álbum del catálogo (desde YouTube, convertido a audio): queda en tu biblioteca y
// suena sin internet. Grande (página del álbum) o compacto (sobre una carátula).
export default function AlbumDownloadButton({
  album,
  ready,
  compact = false,
  className = '',
}: {
  album: { id: number | string; title: string; artist: string; cover?: string }
  /** Canciones ya encontradas en YouTube (página del álbum) */
  ready?: MusicVideo[] | null
  compact?: boolean
  className?: string
}) {
  const id = albumKey(album.id)
  const progress = useOfflineStore((s) => s.progress[id])
  const queued = useOfflineStore((s) => !!s.queue[id])
  const saved = useOfflineStore((s) => Object.values(s.items).filter((i) => i.groupId === id).length)
  const total = useLinksStore((s) => s.albums.find((a) => a.id === id)?.trackIds.length ?? 0)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const done = total > 0 && saved >= total

  const start = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (busy || progress || done) return
    setBusy(true)
    setNote('')
    const n = await downloadCatalogAlbum(album, ready ?? undefined).catch(() => 0)
    setBusy(false)
    if (!n) {
      setNote('No encontramos las canciones en YouTube')
      setTimeout(() => setNote(''), 3000)
    }
  }

  const state = done ? 'done' : progress ? 'progress' : busy || queued ? 'busy' : 'idle'
  const label =
    state === 'done'
      ? `Descargado · ${saved} canciones`
      : state === 'progress'
        ? `Descargando ${Math.min(progress!.done + 1, progress!.total)}/${progress!.total} · ${Math.round(progress!.current * 100)}%`
        : state === 'busy'
          ? 'Buscando las canciones…'
          : note || (saved ? `Descargar el resto (${saved}/${total})` : 'Descargar álbum')
  const icon = state === 'done' ? <CheckCircle2 className="w-4 h-4" /> : state === 'idle' ? <Download className="w-4 h-4" /> : <Loader2 className="w-4 h-4 animate-spin" />

  if (compact)
    return (
      <button
        onClick={start}
        className={`w-8 h-8 rounded-full backdrop-blur-md flex items-center justify-center ${state === 'done' ? 'bg-emerald-500 text-white' : 'bg-black/55 text-white hover:text-cyan-300'} ${className}`}
        aria-label={state === 'done' ? `${album.title} descargado` : `Descargar ${album.title}`}
        title={label}
      >
        {icon}
      </button>
    )
  return (
    <button
      onClick={start}
      className={`inline-flex items-center gap-2 h-12 px-5 rounded-full border text-sm font-semibold ${
        state === 'done' ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300' : 'bg-surface-2/80 border-white/10 text-slate-100'
      } ${className}`}
      aria-label={label}
    >
      {icon} {label}
    </button>
  )
}
