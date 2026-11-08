'use client'
import ProgressFill, { progressText } from '@/components/ProgressFill'

import { useEffect, useState } from 'react'
import { Download, CheckCircle2, X, Loader2, Trash2 } from 'lucide-react'
import { useOfflineStore, canDownload } from '@/store/offlineStore'
import { formatSize } from '@/lib/offline-files'
import type { MusicVideo } from '@/lib/youtube-music'

// Botón "Descargar" de un disco o playlist: descarga sus audios para escuchar sin conexión,
// muestra el avance y, una vez descargado, cuánto ocupa (y permite quitar la descarga)
export default function DownloadButton({
  group,
  tracks,
  compact = false,
}: {
  group: { id: string; title: string; cover?: string }
  tracks: MusicVideo[]
  compact?: boolean
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const items = useOfflineStore((s) => s.items)
  const progress = useOfflineStore((s) => s.progress[group.id])
  const { download, cancel, removeKeys } = useOfflineStore.getState()
  const [confirm, setConfirm] = useState(false)
  if (!mounted) return null

  const downloadable = tracks.filter(canDownload)
  const skipped = tracks.length - downloadable.length
  const have = downloadable.filter((t) => items[t.audioUrl!])
  const size = have.reduce((sum, t) => sum + (items[t.audioUrl!]?.size ?? 0), 0)
  const base = `relative overflow-hidden inline-flex items-center gap-1.5 rounded-full border text-xs font-semibold ${compact ? 'px-3 py-1.5' : 'px-4 py-2.5 text-sm'}`

  if (!downloadable.length)
    return skipped && !compact ? <span className="text-slate-500 text-xs">Las canciones de YouTube no se pueden descargar</span> : null

  if (progress) {
    const all = (progress.done + progress.current) / progress.total
    return (
      <button onClick={() => cancel(group.id)} className={`${base} bg-violet-500/10 border-violet-400/40 text-violet-100`} aria-label="Cancelar descarga">
        <ProgressFill value={all > 0 ? all : null} />
        <span className="relative inline-flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Descargando {Math.min(progress.done + 1, progress.total)}/{progress.total} · {progressText(progress)}
          <X className="w-3.5 h-3.5 opacity-70" />
        </span>
      </button>
    )
  }

  if (have.length === downloadable.length)
    return confirm ? (
      <button
        onClick={() => {
          removeKeys(have.map((t) => t.audioUrl!))
          setConfirm(false)
        }}
        className={`${base} bg-red-500/20 border-red-400/40 text-red-300`}
      >
        <Trash2 className="w-3.5 h-3.5" /> ¿Quitar la descarga ({formatSize(size)})?
      </button>
    ) : (
      <button onClick={() => setConfirm(true)} className={`${base} bg-emerald-500/10 border-emerald-400/40 text-emerald-300`} title="Tocar para quitar la descarga">
        <CheckCircle2 className="w-3.5 h-3.5" /> Descargado · {formatSize(size)}
      </button>
    )

  const missing = downloadable.length - have.length
  return (
    <button onClick={() => download(group, downloadable)} className={`${base} bg-surface-1 border-white/10 text-slate-200`}>
      <Download className="w-3.5 h-3.5" />
      {have.length ? `Descargar ${missing} más` : compact ? 'Descargar' : `Descargar para escuchar sin internet`}
      {skipped > 0 && !compact && <span className="text-slate-500 font-normal">({skipped} de YouTube no)</span>}
    </button>
  )
}
