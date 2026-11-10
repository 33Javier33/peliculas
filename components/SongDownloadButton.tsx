'use client'

import { useState } from 'react'
import { Download, CheckCircle2, Loader2, Trash2 } from 'lucide-react'
import { useOfflineStore, canDownload } from '@/store/offlineStore'
import { useLinksStore } from '@/store/linksStore'
import { formatSize } from '@/lib/offline-files'
import type { MusicVideo } from '@/lib/youtube-music'
import { songGroup } from '@/components/OfflineIcons'
import { convertedTrack, saveConverted, CONVERTED_ALBUM } from '@/lib/yt-convert'
import ProgressFill, { progressText } from '@/components/ProgressFill'

// Descargar la canción que suena (para escucharla sin internet). Queda en "Descargadas", junto
// a su disco si es de uno guardado o en "Canciones sueltas"
export default function SongDownloadButton({ video, className = '', compact = false }: { video: MusicVideo; className?: string; compact?: boolean }) {
  // Canción de YouTube: se convierte a audio (sin video) y se guarda como «Convertidas de YouTube»
  const ytId = !video.audioUrl && !video.streamUrl && /^[A-Za-z0-9_-]{11}$/.test(video.id) ? video.id : ''
  const key = video.audioUrl ?? (ytId ? `/api/stream?id=${ytId}` : '')
  const item = useOfflineStore((s) => (key ? s.items[key] : undefined))
  useLinksStore((s) => s.albums.length)
  const group = ytId ? { id: CONVERTED_ALBUM, title: 'Convertidas de YouTube' } : songGroup(video)
  const progress = useOfflineStore((s) => s.progress[group.id])
  // ¿Esta canción ya está pedida (bajándose o esperando su turno en su grupo)?
  const queued = useOfflineStore((s) => !!key && !!s.queue[group.id]?.tracks.some((t) => t.audioUrl === key))
  const mine = progress?.key === key ? progress : undefined
  const [starting, setStarting] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [note, setNote] = useState('')

  // compact: solo el ícono, redondo (reproductor grande); el texto queda en title / aria-label
  const base = compact
    ? `relative overflow-hidden w-12 h-12 rounded-full flex items-center justify-center border ${className}`
    : `relative overflow-hidden flex items-center justify-center gap-2 border rounded-2xl py-3 text-sm font-semibold font-display ${className}`
  const t = (text: string) => (compact ? null : <> {text}</>)

  if (!canDownload(video) && !ytId)
    return (
      <button
        onClick={() => setNote('Las canciones de YouTube no se pueden descargar. Sí los discos de archive.org y los MP3.')}
        className={`${base} bg-surface-1/80 border-white/8 text-slate-500`}
        title="Las canciones de YouTube no se pueden descargar"
        aria-label="Descargar (no disponible)"
      >
        <Download className={compact ? 'w-5 h-5' : 'w-4 h-4'} />{t(note ? 'YouTube no se descarga' : 'Descargar')}
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
        title="Toca otra vez para quitar la descarga"
        aria-label="¿Quitar descarga?"
      >
        <Trash2 className={compact ? 'w-5 h-5' : 'w-4 h-4'} />{t('¿Quitar descarga?')}
      </button>
    ) : (
      <button
        onClick={() => {
          setConfirm(true)
          if (compact) setTimeout(() => setConfirm(false), 4000)
        }}
        className={`${base} bg-emerald-500/10 border-emerald-400/40 text-emerald-300`}
        title={`Descargada · ${formatSize(item.size)}`}
        aria-label={`Descargada · ${formatSize(item.size)}`}
      >
        <CheckCircle2 className={compact ? 'w-5 h-5' : 'w-4 h-4'} />{t(`Descargada · ${formatSize(item.size)}`)}
      </button>
    )

  if (mine || queued || starting)
    return (
      <button onClick={() => useOfflineStore.getState().cancel(group.id)} className={`${base} bg-violet-500/10 border-violet-400/40 text-violet-100`} aria-label="Cancelar descarga">
        <ProgressFill value={mine && mine.current > 0 ? mine.current : null} />
        <span className="relative flex items-center gap-2" title={mine ? `Descargando ${progressText(mine)}` : 'En cola…'}>
          <Loader2 className={`${compact ? 'w-5 h-5' : 'w-4 h-4'} animate-spin`} />
          {!compact && (mine ? `Descargando ${progressText(mine)}` : 'En cola…')}
        </span>
      </button>
    )

  return (
    <button
      onClick={() => {
        // Se ve al instante que empezó (antes no cambiaba nada hasta que llegaba el primer avance)
        setStarting(true)
        setTimeout(() => setStarting(false), 4000)
        if (ytId) saveConverted([convertedTrack(video)], true)
        else useOfflineStore.getState().download(group, [video])
      }}
      className={`${base} bg-surface-1/80 border-white/8 text-slate-200`}
      title={ytId ? 'Descargar audio (sin internet)' : 'Descargar'}
      aria-label={ytId ? 'Descargar audio' : 'Descargar'}
    >
      <Download className={compact ? 'w-5 h-5' : 'w-4 h-4'} />{t(ytId ? 'Descargar audio' : 'Descargar')}
    </button>
  )
}
