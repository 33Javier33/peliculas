'use client'

import { useState } from 'react'
import { Heart, Loader2 } from 'lucide-react'
import type { MusicVideo } from '@/lib/youtube-music'
import { useMusicStore } from '@/store/musicStore'
import QueueMenu from '@/components/QueueMenu'
import { cachedJson } from '@/lib/client-cache'

// Sobre la carátula de un álbum (perfil del artista, búsqueda): ♥ para guardarlo o quitarlo de tu
// biblioteca ahí mismo y «Agregar a la cola». Las canciones se piden solo al usarlos.
export default function AlbumCardActions({ album }: { album: { id: number; title: string; cover: string; artist: { name: string } } }) {
  const key = `deezer-${album.id}`
  const saved = useMusicStore((s) => s.savedAlbums.some((a) => a.id === key))
  const [busy, setBusy] = useState(false)
  const load = async () => (await cachedJson<{ tracks?: MusicVideo[] }>(`/api/catalog/album/${album.id}/play?quick=1`, 6 * 3600_000))?.tracks ?? []
  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const st = useMusicStore.getState()
    if (saved) return st.toggleAlbum({ id: key, title: album.title, artist: album.artist.name, cover: album.cover, tracks: [] })
    setBusy(true)
    const tracks = await load().catch(() => [])
    setBusy(false)
    if (tracks.length) useMusicStore.getState().toggleAlbum({ id: key, title: album.title, artist: album.artist.name, cover: album.cover, tracks })
  }
  return (
    <div className="absolute right-2 top-2 z-[1] flex items-center gap-1" onClick={(e) => e.preventDefault()}>
      <QueueMenu overlay load={load} label={`Agregar ${album.title} a la cola`} />
      <button
        onClick={toggle}
        className={`w-8 h-8 rounded-full backdrop-blur-md flex items-center justify-center ${saved ? 'bg-violet-500 text-white' : 'bg-black/55 text-white hover:text-violet-300'}`}
        aria-pressed={saved}
        aria-label={saved ? `Quitar ${album.title} de tu biblioteca` : `Guardar ${album.title} en tu biblioteca`}
        title={saved ? 'Guardado (toca para quitarlo)' : 'Guardar el álbum'}
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Heart className={`w-4 h-4 ${saved ? 'fill-white' : ''}`} />}
      </button>
    </div>
  )
}
