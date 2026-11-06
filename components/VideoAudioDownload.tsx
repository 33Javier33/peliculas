'use client'

import { Download, Loader2, CheckCircle2 } from 'lucide-react'
import { useOfflineStore } from '@/store/offlineStore'
import { convertedTrack, saveConverted, CONVERTED_ALBUM } from '@/lib/yt-convert'

// Las películas completas no se convierten (sería una hora de audio sin sentido)
const MOVIE = /pel[ií]cula|movie|film completo|full movie|cap[ií]tulo|episodio|temporada|serie completa|documental/i
export const isMovieTitle = (title: string) => MOVIE.test(title)

// «Descargar audio» de cualquier video de YouTube (videoclips, conciertos, podcasts…, menos
// películas): queda en «Convertidas de YouTube» y suena sin internet y con la pantalla apagada
export default function VideoAudioDownload({ id, title, channelTitle, className = '' }: { id: string; title: string; channelTitle: string; className?: string }) {
  const key = `/api/stream?id=${id}`
  const done = useOfflineStore((s) => !!s.items[key])
  const busy = useOfflineStore((s) => !!s.queue[CONVERTED_ALBUM]?.tracks.some((t) => t.audioUrl === key))
  if (!/^[A-Za-z0-9_-]{11}$/.test(id) || isMovieTitle(title)) return null
  return (
    <button
      onClick={() => !done && !busy && saveConverted([convertedTrack({ id, title, channelTitle })], true)}
      className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-semibold ${
        done ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/10 text-white hover:bg-white/20'
      } ${className}`}
      aria-label={done ? 'Audio descargado' : 'Descargar el audio de este video'}
      title={done ? 'Audio descargado: suena sin internet' : 'Descargar el audio (sin video)'}
    >
      {done ? <CheckCircle2 className="w-4 h-4" /> : busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
      <span className="hidden sm:inline">{done ? 'Audio descargado' : busy ? 'Descargando…' : 'Descargar audio'}</span>
    </button>
  )
}
