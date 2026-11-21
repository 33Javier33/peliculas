'use client'

import Image from 'next/image'
import { Heart, Play, Clock3 } from 'lucide-react'
import { useMusicStore } from '@/store/musicStore'
import type { MusicVideo } from '@/lib/youtube-music'
import { hoverWarm } from '@/lib/warm'

// Lista de canciones del computador, como Spotify: # · Título (y artista) · Álbum · Fecha en que
// se agregó · ♥ · duración. La que suena va resaltada con barritas.

const fmtDate = (t?: number) => {
  if (!t || t < 1e11) return ''
  const days = Math.floor((Date.now() - t) / 86400000)
  if (days <= 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 30) return `hace ${days} días`
  return new Date(t).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })
}

const songTitle = (t: MusicVideo) => t.title.replace(/^[^-–]+[-–]\s*/, '') || t.title
const songArtistOf = (t: MusicVideo) => (t as { artist?: string }).artist || (/ [-–] /.test(t.title) ? t.title.split(/ [-–] /)[0] : '') || t.channelTitle

export default function TrackTable<T extends MusicVideo>({
  tracks,
  onPlay,
  dateOf,
  actions,
}: {
  tracks: T[]
  onPlay: (index: number) => void
  dateOf?: (t: T) => number | undefined
  actions?: (t: T, index: number) => React.ReactNode
}) {
  const currentId = useMusicStore((s) => (s.isVisible ? s.queue[s.currentIndex]?.id : undefined))
  const playing = useMusicStore((s) => s.isPlaying)
  const savedIds = useMusicStore((s) => s.saved)
  const liked = new Set(savedIds.map((t) => t.id))
  const cols = `grid items-center gap-4 ${dateOf ? 'grid-cols-[2.5rem_minmax(0,4fr)_minmax(0,3fr)_minmax(0,2fr)_2.5rem_3.5rem_auto]' : 'grid-cols-[2.5rem_minmax(0,4fr)_minmax(0,3fr)_2.5rem_3.5rem_auto]'}`
  return (
    <div role="table" aria-label="Canciones">
      <div role="row" className={`${cols} px-4 py-2 border-b border-white/10 text-xs font-semibold uppercase tracking-wider text-slate-400`}>
        <span className="text-right">#</span>
        <span>Título</span>
        <span>Álbum</span>
        {dateOf && <span>Agregada</span>}
        <span />
        <span className="flex justify-end">
          <Clock3 className="w-4 h-4" aria-label="Duración" />
        </span>
        <span />
      </div>
      <div className="mt-2">
        {tracks.map((t, i) => {
          const current = t.id === currentId
          return (
            <div
              key={`${t.id}-${i}`}
              role="row"
              onDoubleClick={() => onPlay(i)}
              {...hoverWarm(t)}
              className={`group ${cols} px-4 py-2 rounded-md hover:bg-white/8 ${current ? 'bg-white/5' : ''}`}
            >
              <span className="relative flex justify-end text-slate-400 tabular-nums">
                {current && playing ? (
                  <span className="flex items-end gap-[2px] h-3.5 group-hover:hidden" aria-label="Sonando">
                    <span className="w-[3px] h-2 bg-violet-300 animate-bounce" />
                    <span className="w-[3px] h-3.5 bg-violet-300 animate-bounce [animation-delay:150ms]" />
                    <span className="w-[3px] h-2.5 bg-violet-300 animate-bounce [animation-delay:300ms]" />
                  </span>
                ) : (
                  <span className={`group-hover:hidden ${current ? 'text-violet-300' : ''}`}>{i + 1}</span>
                )}
                <button onClick={() => onPlay(i)} className="hidden group-hover:block text-white" aria-label={`Reproducir ${songTitle(t)}`}>
                  <Play className="w-4 h-4 fill-white" />
                </button>
              </span>
              <button onClick={() => onPlay(i)} className="flex items-center gap-3 min-w-0 text-left">
                <span className="relative w-10 h-10 rounded overflow-hidden bg-surface-2 shrink-0">
                  {t.thumbnail && <Image src={t.thumbnail} alt="" fill sizes="40px" className="object-cover" />}
                </span>
                <span className="min-w-0">
                  <span className={`block text-[15px] truncate ${current ? 'text-violet-300' : 'text-white'}`}>{songTitle(t)}</span>
                  <span className="block text-sm text-slate-400 truncate group-hover:text-slate-200">{songArtistOf(t)}</span>
                </span>
              </button>
              <span className="text-sm text-slate-400 truncate">{t.album || '—'}</span>
              {dateOf && <span className="text-sm text-slate-400 truncate">{fmtDate(dateOf(t))}</span>}
              <button
                onClick={() => useMusicStore.getState().toggleSaved(t)}
                className={`flex justify-center ${liked.has(t.id) ? 'text-violet-300' : 'text-slate-500 opacity-0 group-hover:opacity-100 hover:text-white'}`}
                aria-label={liked.has(t.id) ? 'Quitar de Tus me gusta' : 'Agregar a Tus me gusta'}
                aria-pressed={liked.has(t.id)}
              >
                <Heart className={`w-4 h-4 ${liked.has(t.id) ? 'fill-violet-300' : ''}`} />
              </button>
              <span className="text-sm text-slate-400 text-right tabular-nums">{t.duration || ''}</span>
              <span className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100">{actions?.(t, i)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
