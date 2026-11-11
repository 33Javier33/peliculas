'use client'

import { create } from 'zustand'
import { useMusicStore } from '@/store/musicStore'
import type { V } from '@/lib/music-videos-data'

// Video en miniatura del teléfono: una ventana pequeña que se puede mover y que sigue abierta al
// navegar. El sonido pasa al reproductor de abajo (así nunca se corta, ni con el teléfono bloqueado);
// el video de la miniatura va silenciado y se mantiene sincronizado con el audio.
interface MiniState {
  video: V | null
  start: number
  open: (v: V, start: number) => void
  close: () => void
}

export const useMiniStore = create<MiniState>()((set) => ({
  video: null,
  start: 0,
  open: (video, start) => set({ video, start }),
  close: () => set({ video: null }),
}))

/** ¿Pantalla de teléfono? (la miniatura es para el teléfono; en computador es la ventana del navegador) */
export const isPhoneScreen = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches

/** Suena el audio del video en el reproductor de abajo, desde un segundo (sigue con la pantalla bloqueada) */
export function playAudioAt(v: V, start: number) {
  const music = useMusicStore.getState()
  const track = { id: v.id, title: v.title, channelTitle: v.channel, thumbnail: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`, publishedAt: '', description: '' }
  music.play([track as never], 0)
  music.setIsPlaying(true)
  // Cuando el audio cargó, va al mismo segundo que tenía el video
  let tries = 0
  const iv = window.setInterval(() => {
    const w = window as unknown as { __cpnSeek?: (s: number) => void; __cpnTime?: () => { d: number } }
    tries++
    if ((w.__cpnTime?.().d ?? 0) > 0 || tries > 40) {
      window.clearInterval(iv)
      if (start > 1) w.__cpnSeek?.(start)
    }
  }, 250)
}

/** Abre la miniatura: el sonido sigue en el reproductor de abajo, desde el mismo segundo */
export function openMini(v: V, start: number) {
  playAudioAt(v, start)
  useMiniStore.getState().open(v, start)
}
