'use client'

import { useBlockStore } from '@/store/blockStore'
import { useMusicStore } from '@/store/musicStore'

// «No me interesa»: ocultar una canción/video o un artista en todas partes (colas, Tus me gusta,
// biblioteca, PulsoTube, videos musicales y recomendaciones).

/** Oculta esta canción o video (también la quita de Tus me gusta) */
export function hideSong(t: { id: string; title: string; channelTitle?: string; artist?: string }) {
  useBlockStore.getState().blockSong({ id: t.id, title: t.title, artist: t.artist || t.channelTitle || '' })
  const st = useMusicStore.getState()
  const liked = st.saved.find((s) => s.id === t.id)
  if (liked) st.toggleSaved(liked)
  st.purgeBlocked()
}

/** Oculta todo lo de este artista (sus canciones guardadas no se borran: se dejan de mostrar) */
export function hideArtist(name: string) {
  if (!name.trim()) return
  useBlockStore.getState().blockArtist(name)
  useMusicStore.getState().purgeBlocked()
}
