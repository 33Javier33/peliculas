// Ver un video «como YouTube Music» (app de Android): suena en el reproductor de la app (el mismo
// sonido de siempre, que nunca se corta) y el reproductor grande muestra su imagen pegada a ese
// sonido. Al bloquear el teléfono la música sigue sin ningún corte.
// Devuelve false si no se puede (navegador o app antigua): entonces se usa el reproductor de YouTube.
import { useMusicStore } from '@/store/musicStore'
import { isNativeApp } from '@/lib/native'
import { syncedVideoUrl } from '@/components/SyncedVideo'

export const SHOW_VIDEO_EVENT = 'cpn-show-video'

type V = { id: string; title: string; channelTitle?: string; channel?: string; thumbnail?: string }

export function playVideoSynced(list: V[], index: number): boolean {
  const v = list[index]
  if (!v || !isNativeApp() || !syncedVideoUrl(v.id)) return false
  const items = list
    .filter((x) => /^[A-Za-z0-9_-]{11}$/.test(x.id))
    .map((x) => ({
      id: x.id,
      title: x.title,
      channelTitle: x.channelTitle ?? x.channel ?? '',
      thumbnail: x.thumbnail || `https://i.ytimg.com/vi/${x.id}/hqdefault.jpg`,
      publishedAt: '',
      description: '',
    }))
  const at = Math.max(0, items.findIndex((x) => x.id === v.id))
  const st = useMusicStore.getState()
  st.play(items, at)
  st.setIsPlaying(true)
  window.dispatchEvent(new CustomEvent(SHOW_VIDEO_EVENT, { detail: v.id }))
  return true
}
