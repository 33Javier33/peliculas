'use client'

import { Loader2 } from 'lucide-react'
import { useMusicStore } from '@/store/musicStore'

/** Estado de una pista en el reproductor: 'loading' (tocada, aún sin sonar), 'playing', 'paused' o null */
export function useTrackState(id: string): 'loading' | 'playing' | 'paused' | null {
  return useMusicStore((s) => {
    if (!s.isVisible || s.queue[s.currentIndex]?.id !== id) return null
    if (!s.isPlaying) return 'paused'
    return s.soundingId === id ? 'playing' : 'loading'
  })
}

/** Capa sobre la imagen de la pista: gira mientras carga y muestra barras cuando suena. */
export function TrackStateOverlay({ id, size = 'md' }: { id: string; size?: 'sm' | 'md' }) {
  const state = useTrackState(id)
  if (!state) return null
  return (
    <div className="absolute inset-0 z-[1] flex items-center justify-center bg-black/45 pointer-events-none" aria-live="polite">
      {state === 'loading' ? (
        <span className="flex flex-col items-center gap-1.5">
          <Loader2 className={`${size === 'sm' ? 'w-6 h-6' : 'w-10 h-10'} text-white animate-spin drop-shadow`} />
          {size === 'md' && <span className="text-white text-xs font-semibold drop-shadow">Cargando…</span>}
        </span>
      ) : (
        <span className={`flex items-end gap-[3px] ${size === 'sm' ? 'h-4' : 'h-7'}`} aria-label={state === 'playing' ? 'Sonando' : 'En pausa'}>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`w-1 rounded-full bg-emerald-400 origin-bottom ${state === 'playing' ? 'animate-eq' : ''}`}
              style={{ height: `${[60, 100, 75, 45][i]}%`, animationDelay: `${i * 140}ms` }}
            />
          ))}
        </span>
      )}
    </div>
  )
}
