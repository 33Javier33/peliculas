import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { MusicVideo } from '@/lib/youtube-music'

// Canciones agregadas desde enlaces (MP3 u otras páginas), ordenadas por disco.
// Se guardan en el teléfono.

export interface LinkAlbum {
  id: string
  title: string
  artist: string
  year?: string
  cover?: string
  description?: string
  /** Página de donde salió */
  source: string
  addedAt: number
  /** Canciones del disco, en orden */
  trackIds: string[]
}

interface LinksState {
  tracks: MusicVideo[]
  albums: LinkAlbum[]
  addTracks: (tracks: MusicVideo[]) => number
  /** Agrega un disco con sus canciones (o completa uno que ya estaba). Devuelve las canciones nuevas. */
  addAlbum: (album: Omit<LinkAlbum, 'trackIds' | 'addedAt'>, tracks: MusicVideo[], replaceIds?: string[]) => number
  removeTrack: (id: string) => void
  removeAlbum: (id: string) => void
}

export const useLinksStore = create<LinksState>()(
  persist(
    (set, get) => ({
      tracks: [],
      albums: [],
      addTracks: (tracks) => {
        const known = new Set(get().tracks.map((t) => t.audioUrl))
        const fresh = tracks.filter((t) => t.audioUrl && !known.has(t.audioUrl))
        if (fresh.length) set({ tracks: [...fresh, ...get().tracks].slice(0, 2000) })
        return fresh.length
      },
      addAlbum: (info, list, replaceIds = []) => {
        const drop = new Set(replaceIds)
        const kept = get().tracks.filter((t) => !drop.has(t.id))
        const byUrl = new Map(kept.map((t) => [t.audioUrl, t]))
        // Las que ya estaban (de antes) se quedan con su id y pasan a este disco con su información
        const albumTracks = list.filter((t) => t.audioUrl).map((t) => ({ ...t, id: byUrl.get(t.audioUrl)?.id ?? t.id }))
        const ids = new Set(albumTracks.map((t) => t.id))
        const fresh = albumTracks.filter((t) => !byUrl.has(t.audioUrl)).length
        const others = get().albums
          .filter((a) => a.id !== info.id)
          .map((a) => ({ ...a, trackIds: a.trackIds.filter((id) => !ids.has(id) && !drop.has(id)) }))
          .filter((a) => a.trackIds.length)
        const prev = get().albums.find((a) => a.id === info.id)
        const album: LinkAlbum = {
          ...info,
          addedAt: prev?.addedAt ?? Date.now(),
          trackIds: albumTracks.map((t) => t.id),
        }
        set({
          tracks: [...albumTracks, ...kept.filter((t) => !ids.has(t.id))].slice(0, 2000),
          albums: [album, ...others],
        })
        return fresh
      },
      removeTrack: (id) =>
        set({
          tracks: get().tracks.filter((t) => t.id !== id),
          albums: get()
            .albums.map((a) => ({ ...a, trackIds: a.trackIds.filter((x) => x !== id) }))
            .filter((a) => a.trackIds.length),
        }),
      removeAlbum: (id) => {
        const album = get().albums.find((a) => a.id === id)
        const drop = new Set(album?.trackIds ?? [])
        set({ tracks: get().tracks.filter((t) => !drop.has(t.id)), albums: get().albums.filter((a) => a.id !== id) })
      },
    }),
    {
      name: 'cpn-links-store',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      migrate: (state) => ({ albums: [], ...(state as object) }) as unknown as LinksState,
    }
  )
)
