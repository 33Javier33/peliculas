'use client'

import Image from 'next/image'
import { Play } from 'lucide-react'
import { TrackStateOverlay } from '@/components/TrackState'
import { useMusicStore } from '@/store/musicStore'
import type { MusicVideo } from '@/lib/youtube-music'

// Lista o mosaico de canciones (la misma información en las dos vistas). Toda la fila o tarjeta
// pone a sonar la canción; "actions" agrega botones propios a cada una.
export default function TrackTiles({
  tracks,
  view,
  onPlay,
  actions,
  numbered = false,
}: {
  tracks: MusicVideo[]
  view: 'list' | 'grid'
  onPlay: (index: number) => void
  actions?: (t: MusicVideo, index: number) => React.ReactNode
  numbered?: boolean
}) {
  const currentId = useMusicStore((s) => (s.isVisible ? s.queue[s.currentIndex]?.id : undefined))
  const name = (t: MusicVideo) => t.title.replace(/^[^-–]+[-–]\s*/, '') || t.title
  const sub = (t: MusicVideo) => [t.channelTitle, t.album].filter(Boolean).join(' · ')

  if (view === 'grid')
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
        {tracks.map((t, i) => (
          <div key={`${t.id}-${i}`} onClick={() => onPlay(i)} className="group relative cursor-pointer bg-surface-1 border border-white/8 rounded-xl overflow-hidden hover:border-violet-500/30">
            <div className="relative aspect-square bg-surface-2">
              {t.thumbnail && <Image src={t.thumbnail} alt="" fill sizes="(max-width: 640px) 50vw, 20vw" className="object-cover" />}
              <TrackStateOverlay id={t.id} />
              <span className="absolute right-2 bottom-2 w-9 h-9 rounded-full bg-violet-500 flex items-center justify-center">
                <Play className="w-4 h-4 text-white fill-white ml-0.5" />
              </span>
              {t.duration && <span className="absolute left-2 bottom-2 text-[10px] font-mono text-white/90 bg-black/60 px-1.5 py-0.5 rounded">{t.duration}</span>}
            </div>
            <div className="p-2.5">
              <p className={`text-sm leading-tight font-semibold line-clamp-2 ${t.id === currentId ? 'text-emerald-400' : 'text-white'}`}>{name(t)}</p>
              <p className="text-slate-400 text-xs truncate mt-0.5">{sub(t)}</p>
            </div>
            {actions && (
              <div className="absolute right-1.5 top-1.5 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                {actions(t, i)}
              </div>
            )}
          </div>
        ))}
      </div>
    )

  return (
    <ul className="divide-y divide-white/5 border border-white/5 rounded-xl overflow-hidden bg-obsidian">
      {tracks.map((t, i) => (
        <li
          key={`${t.id}-${i}`}
          onClick={() => onPlay(i)}
          className={`flex items-center gap-3 px-3 sm:px-4 py-2.5 cursor-pointer hover:bg-white/5 active:bg-white/10 ${t.id === currentId ? 'bg-emerald-500/5' : ''}`}
        >
          {numbered && <span className="w-5 shrink-0 text-right text-slate-600 text-xs tabular-nums">{i + 1}</span>}
          <span className="relative w-11 h-11 rounded-lg overflow-hidden shrink-0 bg-surface-2">
            {t.thumbnail && <Image src={t.thumbnail} alt="" fill sizes="44px" className="object-cover" />}
            <TrackStateOverlay id={t.id} size="sm" />
          </span>
          <span className="min-w-0 flex-1">
            <span className={`block text-sm font-medium truncate ${t.id === currentId ? 'text-emerald-400' : 'text-white'}`}>{name(t)}</span>
            <span className="block text-slate-500 text-xs truncate">{sub(t)}</span>
          </span>
          {t.duration && <span className="text-slate-600 text-xs font-mono hidden sm:block">{t.duration}</span>}
          {actions && (
            <span className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
              {actions(t, i)}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}
