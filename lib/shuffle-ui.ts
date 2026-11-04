'use client'

import { create } from 'zustand'
import { useMusicStore } from '@/store/musicStore'

// Botones "Aleatorio": se pintan mientras suena en aleatorio la lista que ese botón empezó.
// Cada botón tiene una clave (p. ej. "playlist:ID"); al tocarlo se recuerda la clave y la primera
// canción de la cola (si después se pone otra lista, la cola cambia y el botón se apaga solo).

const useSource = create<{ key: string | null; first: string | null }>(() => ({ key: null, first: null }))

/** Llamar justo después de empezar a reproducir en aleatorio desde un botón */
export function markShuffle(key: string) {
  const q = useMusicStore.getState().queue
  useSource.setState({ key, first: q[0]?.id ?? null })
}

/** ¿Este botón "Aleatorio" está activo? */
export function useShuffleOn(key: string): boolean {
  const src = useSource()
  return useMusicStore((s) => s.shuffle && !!src.first && src.key === key && s.queue[0]?.id === src.first)
}

/** Estilo del botón activo (se impone sobre el color normal del botón) */
export const SHUFFLE_ON = '!bg-emerald-500 !border-emerald-300 !text-white shadow-[0_0_16px_rgba(16,185,129,0.5)]'

/** Recordar qué lista empezó a sonar (mezclas, Tus me gusta…), en orden o en aleatorio */
export const markSource = markShuffle

/** ¿Suena ahora algo que empezó esta lista? (para mostrar las barritas en su tarjeta) */
export function usePlayingFrom(key: string): 'playing' | 'paused' | null {
  const src = useSource()
  return useMusicStore((s) => {
    if (!src.first || src.key !== key || s.queue[0]?.id !== src.first || !s.isVisible) return null
    return s.isPlaying ? 'playing' : 'paused'
  })
}
