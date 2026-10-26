import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { decodeEntities, type MusicVideo } from '@/lib/youtube-music'

export type { MusicVideo }

export interface SavedTrack extends MusicVideo {
  savedAt: number
  album?: string
  artist?: string
}

export interface HistoryEntry extends MusicVideo {
  playedAt: number
  plays: number
  artist?: string
  album?: string
}

const MAX_HISTORY = 80

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
  history: HistoryEntry[]
  audioBoost: boolean
  // Modo audio: reproduce solo el sonido con un <audio> propio (sigue en segundo plano)
  audioMode: boolean
  // Radio: al llegar al final de la cola se añade música parecida automáticamente
  radioEnabled: boolean
  repeatMode: 'off' | 'all' | 'one'
  shuffle: boolean
  // Populated after zustand rehydrates from localStorage on the client.
  // Used by the player bar to resume the previous playback position.
  resumeAt: number
  hasHydrated: boolean
}

interface MusicActions {
  play: (videos: MusicVideo[], startIndex?: number) => void
  addToQueue: (video: MusicVideo) => void
  appendToQueue: (videos: MusicVideo[]) => number
  setRadioEnabled: (v: boolean) => void
  cycleRepeat: () => void
  toggleShuffle: () => void
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
  recordPlay: (video: MusicVideo) => void
  clearHistory: () => void
  setAudioBoost: (v: boolean) => void
  setAudioMode: (v: boolean) => void
  consumeResume: () => number
  setHasHydrated: (v: boolean) => void
}

type MusicStore = MusicState & MusicActions

// Heuristics: extract artist and album from a YouTube music video's title/channel.
// Titles usually look like: "Artist - Song (Official Video) [Album Name]"
//                         | "Artist | Song - Album"
//                         | "Song - Artist" (less common)
export function parseTrackMeta(video: MusicVideo): { artist: string; album?: string } {
  const rawTitle = video.title || ''
  const channel = (video.channelTitle || '').replace(/\s*-?\s*(Topic|VEVO|Official)\s*$/i, '').trim()

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
      history: [],
      audioBoost: false,
      audioMode: true,
      radioEnabled: true,
      repeatMode: 'off',
      shuffle: false,
      resumeAt: 0,
      hasHydrated: false,

      play: (videos, startIndex = 0) => {
        const start = videos[startIndex]
        set({ queue: videos, currentIndex: startIndex, isPlaying: true, isVisible: true, played: 0, duration: 0, resumeAt: 0 })
        if (start) get().recordPlay(start)
      },

      appendToQueue: (videos) => {
        const { queue } = get()
        const inQueue = new Set(queue.map((v) => v.id))
        const fresh = videos.filter((v) => !inQueue.has(v.id) && inQueue.add(v.id))
        if (fresh.length > 0) set({ queue: [...queue, ...fresh] })
        return fresh.length
      },

      setRadioEnabled: (v) => set({ radioEnabled: v }),

      cycleRepeat: () =>
        set((s) => ({ repeatMode: s.repeatMode === 'off' ? 'all' : s.repeatMode === 'all' ? 'one' : 'off' })),

      // Al activar "mezclar" se reordena al azar lo que queda por sonar
      toggleShuffle: () => {
        const { shuffle, queue, currentIndex } = get()
        if (!shuffle) {
          const upcoming = queue.slice(currentIndex + 1)
          for (let i = upcoming.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            ;[upcoming[i], upcoming[j]] = [upcoming[j], upcoming[i]]
          }
          set({ shuffle: true, queue: [...queue.slice(0, currentIndex + 1), ...upcoming] })
        } else {
          set({ shuffle: false })
        }
      },

      addToQueue: (video) => {
        const { queue, isVisible } = get()
        if (!isVisible) {
          set({ queue: [video], currentIndex: 0, isPlaying: true, isVisible: true, played: 0, duration: 0, resumeAt: 0 })
          get().recordPlay(video)
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
          set({ currentIndex: index, isPlaying: true, played: 0, duration: 0, resumeAt: 0 })
          get().recordPlay(queue[index])
        }
      },

      playNext: () => {
        const { currentIndex, queue } = get()
        if (currentIndex < queue.length - 1) {
          const nextIdx = currentIndex + 1
          set({ currentIndex: nextIdx, isPlaying: true, played: 0, duration: 0, resumeAt: 0 })
          get().recordPlay(queue[nextIdx])
        } else if (get().repeatMode === 'all' && queue.length > 0) {
          set({ currentIndex: 0, isPlaying: true, played: 0, duration: 0, resumeAt: 0 })
          get().recordPlay(queue[0])
        } else {
          set({ isPlaying: false })
        }
      },

      playPrev: () => {
        const { currentIndex, played, seekCallback, queue } = get()
        if (played > 0.05) {
          seekCallback?.(0)
          set({ played: 0 })
        } else if (currentIndex > 0) {
          const prevIdx = currentIndex - 1
          set({ currentIndex: prevIdx, isPlaying: true, played: 0, duration: 0, resumeAt: 0 })
          get().recordPlay(queue[prevIdx])
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
        set({ isVisible: false, isPlaying: false, queue: [], currentIndex: 0, played: 0, duration: 0, isQueueOpen: false, resumeAt: 0 }),

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
        const queue = saved.map(({ savedAt: _savedAt, artist: _artist, album: _album, ...v }) => v)
        set({
          queue,
          currentIndex: Math.min(Math.max(0, startIndex), saved.length - 1),
          isPlaying: true,
          isVisible: true,
          played: 0,
          duration: 0,
          resumeAt: 0,
        })
        const start = queue[Math.min(Math.max(0, startIndex), queue.length - 1)]
        if (start) get().recordPlay(start)
      },

      recordPlay: (video) => {
        const meta = parseTrackMeta(video)
        const { history } = get()
        const existing = history.find((h) => h.id === video.id)
        const entry: HistoryEntry = {
          ...video,
          artist: meta.artist,
          album: meta.album,
          playedAt: Date.now(),
          plays: (existing?.plays ?? 0) + 1,
        }
        const rest = history.filter((h) => h.id !== video.id)
        set({ history: [entry, ...rest].slice(0, MAX_HISTORY) })
      },

      clearHistory: () => set({ history: [] }),

      setAudioBoost: (v) => set({ audioBoost: v }),
      setAudioMode: (v) => set({ audioMode: v }),

      consumeResume: () => {
        const { resumeAt } = get()
        if (resumeAt > 0) set({ resumeAt: 0 })
        return resumeAt
      },

      setHasHydrated: (v) => set({ hasHydrated: v }),
    }),
    {
      name: 'carlospn-music-store',
      storage: createJSONStorage(() => localStorage),
      version: 2,
      partialize: (state) => ({
        saved: state.saved,
        volume: state.volume,
        isMuted: state.isMuted,
        queue: state.queue,
        currentIndex: state.currentIndex,
        isVisible: state.isVisible,
        played: state.played,
        history: state.history,
        audioBoost: state.audioBoost,
        audioMode: state.audioMode,
        radioEnabled: state.radioEnabled,
        repeatMode: state.repeatMode,
        shuffle: state.shuffle,
      }),
      onRehydrateStorage: () => (state) => {
        // Browsers block autoplay on cold load; keep paused and remember the
        // position so the player can seek back when the user hits play.
        if (state) {
          // Títulos guardados antes de decodificar las entidades HTML de YouTube
          const clean = <T extends MusicVideo>(v: T): T => ({
            ...v,
            title: decodeEntities(v.title),
            channelTitle: decodeEntities(v.channelTitle),
          })
          state.queue = state.queue.map(clean)
          state.history = state.history.map(clean)
          state.saved = state.saved.map(clean)
          state.isPlaying = false
          state.resumeAt = state.played || 0
          state.duration = 0
          state.hasHydrated = true
        }
      },
    }
  )
)
