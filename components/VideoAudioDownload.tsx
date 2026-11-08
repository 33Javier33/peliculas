'use client'
import ProgressFill, { progressText } from '@/components/ProgressFill'

import { Download, Loader2, CheckCircle2 } from 'lucide-react'
import { useOfflineStore } from '@/store/offlineStore'
import { convertedTrack, saveConverted, CONVERTED_ALBUM } from '@/lib/yt-convert'

// «Descargar audio» de CUALQUIER video de YouTube (videoclips, conciertos, podcasts, películas…):
// queda en «Convertidas de YouTube» y suena sin internet y con la pantalla apagada.
// compact: botón redondo para ponerlo sobre la miniatura de un video.
export default function VideoAudioDownload({
  id,
  title,
  channelTitle,
  compact = false,
  className = '',
}: {
  id: string
  title: string
  channelTitle: string
  compact?: boolean
  className?: string
}) {
  const key = `/api/stream?id=${id}`
  const done = useOfflineStore((s) => !!s.items[key])
  const busy = useOfflineStore((s) => !!s.queue[CONVERTED_ALBUM]?.tracks.some((t) => t.audioUrl === key))
  // Avance de ESTE audio (el grupo puede estar bajando otro: entonces este espera en cola)
  const prog = useOfflineStore((s) => (busy && s.progress[CONVERTED_ALBUM]?.key === key ? s.progress[CONVERTED_ALBUM] : undefined))
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null
  const start = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (done) return useOfflineStore.getState().notify('Este audio ya está descargado: suena sin internet')
    if (!busy) saveConverted([convertedTrack({ id, title, channelTitle })], true)
  }
  const icon = done ? <CheckCircle2 className="w-4 h-4" /> : busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />
  const label = done ? 'Audio descargado' : busy ? (prog ? `Descargando ${progressText(prog)}` : 'En cola…') : 'Descargar audio'
  const fill = busy ? <ProgressFill value={prog && prog.current > 0 ? prog.current : null} className="bg-cyan-400/40" /> : null
  if (compact)
    return (
      <button
        onClick={start}
        className={`relative overflow-hidden w-9 h-9 rounded-full backdrop-blur-md flex items-center justify-center transition-colors ${done ? 'bg-emerald-500/90 text-white' : 'bg-black/60 text-white hover:bg-black/80'} ${className}`}
        aria-label={done ? `Audio de ${title} descargado` : `Descargar el audio de ${title}`}
        title={label}
      >
        {fill}
        <span className="relative">{icon}</span>
      </button>
    )
  return (
    <button
      onClick={start}
      className={`relative overflow-hidden inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-semibold ${
        done ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/10 text-white hover:bg-white/20'
      } ${className}`}
      aria-label={done ? 'Audio descargado' : 'Descargar el audio de este video'}
      title={done ? 'Audio descargado: suena sin internet' : 'Descargar el audio (sin video)'}
    >
      {fill}
      <span className="relative">{icon}</span>
      <span className="relative hidden sm:inline">{label}</span>
    </button>
  )
}
