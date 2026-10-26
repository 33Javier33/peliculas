import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { MusicVideo } from '@/lib/youtube-music'
import type { TvChannel } from '@/lib/live'

// Favoritos de "En vivo": radios (guardadas como pista con streamUrl, listas para el
// reproductor) y canales de TV. Se guardan en el teléfono, como la biblioteca de música.
interface LiveState {
  favoriteRadios: MusicVideo[]
  favoriteChannels: TvChannel[]
  toggleFavoriteRadio: (track: MusicVideo) => void
  toggleFavoriteChannel: (channel: TvChannel) => void
}

export const useLiveStore = create<LiveState>()(
  persist(
    (set, get) => ({
      favoriteRadios: [],
      favoriteChannels: [],

      toggleFavoriteRadio: (track) => {
        const { favoriteRadios } = get()
        set({
          favoriteRadios: favoriteRadios.some((r) => r.id === track.id)
            ? favoriteRadios.filter((r) => r.id !== track.id)
            : [track, ...favoriteRadios],
        })
      },

      toggleFavoriteChannel: (channel) => {
        const { favoriteChannels } = get()
        set({
          favoriteChannels: favoriteChannels.some((c) => c.url === channel.url)
            ? favoriteChannels.filter((c) => c.url !== channel.url)
            : [channel, ...favoriteChannels],
        })
      },
    }),
    {
      name: 'cpn-live-store',
      storage: createJSONStorage(() => localStorage),
      version: 1,
    }
  )
)
