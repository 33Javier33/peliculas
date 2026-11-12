import { adoptMusic, castingNow, castKind } from '@/lib/native-cast'
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
  // Ya suena en la TV como parte de la música: solo se muestra el reproductor (no se reemplaza la cola)
  if (castingNow() && castKind() === 'music' && st.queue[st.currentIndex]?.id === v.id) {
    st.requestFullPlayer(true)
    return
  }
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

/**
 * Un video (con su lista) pasa a la música para verse en la TV: la cola es la lista de videos y
 * la TV sigue sola con el próximo. Un solo reproductor para todo (barra, canción/video, TV).
 */
export function tvTakeVideo(
  items: { id: string; title: string; channel?: string }[],
  current: { id: string; title: string; channel?: string },
  position: number,
  opts: { video: boolean; reload: boolean }
) {
  const st = useMusicStore.getState()
  adoptMusic()
  if (st.queue[st.currentIndex]?.id !== current.id) {
    let list = items.length ? items : [current]
    let idx = list.findIndex((x) => x.id === current.id)
    if (idx < 0) {
      list = [current, ...list]
      idx = 0
    }
    st.play(
      list.map(
        (x) =>
          ({
            id: x.id,
            title: x.title,
            channelTitle: x.channel ?? '',
            thumbnail: `https://i.ytimg.com/vi/${x.id}/hqdefault.jpg`,
            publishedAt: '',
            description: '',
          }) as Parameters<typeof st.play>[0][number]
      ),
      idx
    )
  }
  window.dispatchEvent(new CustomEvent('cpn-tv-take', { detail: { video: opts.video, pos: position, reload: opts.reload } }))
}
