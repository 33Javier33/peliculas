'use client'

import { useState } from 'react'
import { Download, CheckCircle2, Loader2, Trash2 } from 'lucide-react'
import { useOfflineStore, canDownload } from '@/store/offlineStore'
import { useLinksStore } from '@/store/linksStore'
import { formatSize } from '@/lib/offline-files'
import type { MusicVideo } from '@/lib/youtube-music'
import { songGroup } from '@/components/OfflineIcons'

// Descargar la canción que suena (para escucharla sin internet). Queda en "Descargadas", junto
// a su disco si es de uno guardado o en "Canciones sueltas"
export default function SongDownloadButton({ video, className = '' }: { video: MusicVideo; className?: string }) {
  const key = video.audioUrl ?? ''
  const item = useOfflineStore((s) => (key ? s.items[key] : undefined))
  useLinksStore((s) => s.albums.length)
  const group = songGroup(video)
  const progress = useOfflineStore((s) => s.progress[group.id])
  const [confirm, setConfirm] = useState(false)
  const [note, setNote] = useState('')

  const base = `flex items-center justify-center gap-2 border rounded-2xl py-3 text-sm font-semibold font-display ${className}`

  if (!canDownload(video))
    return (
      <button
        onClick={() => setNote('Las canciones de YouTube no se pueden descargar. Sí los discos de archive.org y los MP3.')}
        className={`${base} bg-surface-1/80 border-white/8 text-slate-500`}
        title="Las canciones de YouTube no se pueden descargar"
      >
        <Download className="w-4 h-4" /> {note ? 'YouTube no se descarga' : 'Descargar'}
        {note && <span className="sr-only">{note}</span>}
      </button>
    )

  if (item)
    return confirm ? (
      <button
        onClick={() => {
          useOfflineStore.getState().removeKeys([key])
          setConfirm(false)
        }}
        className={`${base} bg-red-500/20 border-red-400/40 text-red-300`}
      >
        <Trash2 className="w-4 h-4" /> ¿Quitar descarga?
      </button>
    ) : (
      <button onClick={() => setConfirm(true)} className={`${base} bg-emerald-500/10 border-emerald-400/40 text-emerald-300`}>
        <CheckCircle2 className="w-4 h-4" /> Descargada · {formatSize(item.size)}
      </button>
    )

  if (progress)
    return (
      <button onClick={() => useOfflineStore.getState().cancel(group.id)} className={`${base} bg-violet-500/15 border-violet-400/40 text-violet-200`} aria-label="Cancelar descarga">
        <Loader2 className="w-4 h-4 animate-spin" /> Descargando {Math.round(progress.current * 100)}%
      </button>
    )

  return (
    <button onClick={() => useOfflineStore.getState().download(group, [video])} className={`${base} bg-surface-1/80 border-white/8 text-slate-200`}>
      <Download className="w-4 h-4" /> Descargar
    </button>
  )
}
