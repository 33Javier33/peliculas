import { useMusicStore } from '@/store/musicStore'

/**
 * Un video que se estaba viendo en grande sigue en la ventana chica del reproductor (sobre la
 * barra de abajo), desde el mismo segundo y sin cortarse.
 */
export function continueInMiniPlayer(v: { id: string; title: string; channelTitle: string }, currentTime = 0) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(v.id)) return
  useMusicStore.getState().play(
    [
      {
        id: v.id,
        title: v.title,
        channelTitle: v.channelTitle,
        thumbnail: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
        publishedAt: '',
        description: '',
        isVideo: true,
        startAt: Math.max(0, Math.floor(currentTime)),
      },
    ],
    0
  )
}

/**
 * «Canción» en un video abierto desde Videos o un artista: sigue como canción (solo audio) desde
 * el mismo segundo y se abre el reproductor (ahí se puede volver al video con «Video»).
 */
export function continueAsSong(v: { id: string; title: string; channelTitle: string }, currentTime = 0) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(v.id)) return
  const st = useMusicStore.getState()
  st.play(
    [
      {
        id: v.id,
        title: v.title,
        channelTitle: v.channelTitle,
        thumbnail: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
        publishedAt: '',
        description: '',
        startAt: Math.max(0, Math.floor(currentTime)),
        forceAudio: true,
      } as Parameters<typeof st.play>[0][number],
    ],
    0
  )
  st.requestFullPlayer(true)
}
