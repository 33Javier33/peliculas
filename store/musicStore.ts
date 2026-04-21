import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { MusicVideo } from '@/lib/youtube-music'

export type { MusicVideo }

export interface SavedTrack extends MusicVideo {
  savedAt: number
  album?: string
  artist?: string
}

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
  saved: SavedTrack[]
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
  saveTrack: (video: MusicVideo) => void
  removeSaved: (id: string) => void
  toggleSaved: (video: MusicVideo) => void
  isSaved: (id: string) => boolean
  playSaved: (startIndex?: number) => void
}

type MusicStore = MusicState & MusicActions

// Heuristics: extract artist and album from a YouTube music video's title/channel.
// Titles usually look like: "Artist - Song (Official Video) [Album Name]"
//                         | "Artist | Song - Album"
//                         | "Song - Artist" (less common)
export function parseTrackMeta(video: MusicVideo): { artist: string; album?: string } {
  const rawTitle = video.title || ''
  const channel = (video.channelTitle || '').replace(/\s*-?\s*(Topic|VEVO|Official)\s*$/i, '').trim()

  // Try to pull a bracketed album like [Album Name] or (Album: Name)
  let album: string | undefined
  const bracket = rawTitle.match(/\[([^\]]+)\]/)
  if (bracket) {
    const inside = bracket[1].trim()
    if (!/official|video|audio|lyrics|hd|4k|mv|m\/v/i.test(inside)) {
      album = inside
    }
  }
  if (!album) {
    const albumTag = rawTitle.match(/(?:album|from the album)\s*[:\-]\s*["“]?([^"”()\-|]+)["”]?/i)
    if (albumTag) album = albumTag[1].trim()
  }

  // Infer artist: prefer "Artist - Song" prefix, fall back to channel name
  let artist = channel
  const dashSplit = rawTitle.split(/\s[-–—|]\s/)
  if (dashSplit.length >= 2) {
    const candidate = dashSplit[0].trim()
    if (candidate.length > 0 && candidate.length < 60) artist = candidate
  }
  if (!artist) artist = channel || 'Desconocido'

  return { artist, album }
}

export const useMusicStore = create<MusicStore>()(
  persist(
    (set, get) => ({
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
      saved: [],

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

      saveTrack: (video) => {
        const { saved } = get()
        if (saved.some((t) => t.id === video.id)) return
        const meta = parseTrackMeta(video)
        const track: SavedTrack = { ...video, savedAt: Date.now(), artist: meta.artist, album: meta.album }
        set({ saved: [track, ...saved] })
      },

      removeSaved: (id) => {
        set({ saved: get().saved.filter((t) => t.id !== id) })
      },

      toggleSaved: (video) => {
        const { saved } = get()
        if (saved.some((t) => t.id === video.id)) {
          set({ saved: saved.filter((t) => t.id !== video.id) })
        } else {
          const meta = parseTrackMeta(video)
          const track: SavedTrack = { ...video, savedAt: Date.now(), artist: meta.artist, album: meta.album }
          set({ saved: [track, ...saved] })
        }
      },

      isSaved: (id) => get().saved.some((t) => t.id === id),

      playSaved: (startIndex = 0) => {
        const { saved } = get()
        if (saved.length === 0) return
        set({
          queue: saved.map(({ savedAt: _savedAt, artist: _artist, album: _album, ...v }) => v),
          currentIndex: Math.min(Math.max(0, startIndex), saved.length - 1),
          isPlaying: true,
          isVisible: true,
          played: 0,
          duration: 0,
        })
      },
    }),
    {
      name: 'carlospn-music-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ saved: state.saved, volume: state.volume, isMuted: state.isMuted }),
    }
  )
)
