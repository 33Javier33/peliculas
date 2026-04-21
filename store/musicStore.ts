import { create } from 'zustand'
import type { MusicVideo } from '@/lib/youtube-music'

export type { MusicVideo }

interface MusicState {
  queue: MusicVideo[]
  currentIndex: number
  isPlaying: boolean
  volume: number
  isMuted: boolean
  played: number
  duration: number
  isVisible: boolean
  isQueueOpen: boolean
  seekCallback: ((fraction: number) => void) | null
}

interface MusicActions {
  play: (videos: MusicVideo[], startIndex?: number) => void
  addToQueue: (video: MusicVideo) => void
  removeFromQueue: (index: number) => void
  playIndex: (index: number) => void
  playNext: () => void
  playPrev: () => void
  togglePlay: () => void
  setIsPlaying: (v: boolean) => void
  setVolume: (v: number) => void
  toggleMute: () => void
  setPlayed: (p: number) => void
  setDuration: (d: number) => void
  registerSeek: (fn: (fraction: number) => void) => void
  seekTo: (fraction: number) => void
  toggleQueue: () => void
  dismiss: () => void
}

type MusicStore = MusicState & MusicActions

export const useMusicStore = create<MusicStore>((set, get) => ({
  queue: [],
  currentIndex: 0,
  isPlaying: false,
  volume: 0.8,
  isMuted: false,
  played: 0,
  duration: 0,
  isVisible: false,
  isQueueOpen: false,
  seekCallback: null,

  play: (videos, startIndex = 0) =>
    set({ queue: videos, currentIndex: startIndex, isPlaying: true, isVisible: true, played: 0, duration: 0 }),

  addToQueue: (video) => {
    const { queue, isVisible } = get()
    if (!isVisible) {
      set({ queue: [video], currentIndex: 0, isPlaying: true, isVisible: true, played: 0, duration: 0 })
    } else {
      set({ queue: [...queue, video] })
    }
  },

  removeFromQueue: (index) => {
    const { queue, currentIndex } = get()
    const newQueue = queue.filter((_, i) => i !== index)
    let newIndex = currentIndex
    if (index < currentIndex) newIndex = currentIndex - 1
    else if (index === currentIndex) newIndex = Math.min(currentIndex, newQueue.length - 1)
    if (newQueue.length === 0) {
      set({ queue: [], isVisible: false, isPlaying: false, currentIndex: 0 })
    } else {
      set({ queue: newQueue, currentIndex: Math.max(0, newIndex), played: 0 })
    }
  },

  playIndex: (index) => {
    const { queue } = get()
    if (index >= 0 && index < queue.length) {
      set({ currentIndex: index, isPlaying: true, played: 0, duration: 0 })
    }
  },

  playNext: () => {
    const { currentIndex, queue } = get()
    if (currentIndex < queue.length - 1) {
      set({ currentIndex: currentIndex + 1, isPlaying: true, played: 0, duration: 0 })
    } else {
      set({ isPlaying: false })
    }
  },

  playPrev: () => {
    const { currentIndex, played, seekCallback } = get()
    if (played > 0.05) {
      seekCallback?.(0)
      set({ played: 0 })
    } else if (currentIndex > 0) {
      set({ currentIndex: currentIndex - 1, isPlaying: true, played: 0, duration: 0 })
    }
  },

  togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),
  setIsPlaying: (v) => set({ isPlaying: v }),

  setVolume: (v) => set({ volume: v, isMuted: v === 0 }),
  toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),

  setPlayed: (p) => set({ played: p }),
  setDuration: (d) => set({ duration: d }),

  registerSeek: (fn) => set({ seekCallback: fn }),
  seekTo: (fraction) => {
    const { seekCallback } = get()
    seekCallback?.(fraction)
    set({ played: fraction })
  },

  toggleQueue: () => set((s) => ({ isQueueOpen: !s.isQueueOpen })),

  dismiss: () =>
    set({ isVisible: false, isPlaying: false, queue: [], currentIndex: 0, played: 0, duration: 0, isQueueOpen: false }),
}))
