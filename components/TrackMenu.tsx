'use client'

import { useEffect, useState } from 'react'
import { Disc3, UserRound, Library, Loader2, X } from 'lucide-react'
import { useLinksStore } from '@/store/linksStore'
import { readSession, writeSession } from '@/lib/session-cache'
import type { MusicVideo } from '@/lib/youtube-music'

// Menú "⋮" de la canción que suena (como en Spotify): ir al álbum, al artista o a su discografía.

type Info = { album: { id: number; title: string; cover: string }; artist: { id: number; name: string } } | null

export default function TrackMenu({
  video,
  artist,
  title,
  onClose,
  onNavigate,
}: {
  video: MusicVideo
  artist: string
  title: string
  onClose: () => void
  /** Cierra la pantalla del reproductor y va a esa página */
  onNavigate: (href: string) => void
}) {
  const [info, setInfo] = useState<Info | undefined>(undefined)
  // Disco guardado desde un enlace o Internet Archive que contiene esta canción
  const linkAlbum = useLinksStore((s) => s.albums.find((a) => a.trackIds.includes(video.id)))

  useEffect(() => {
    const key = `track-info:${artist}|${title}`.toLowerCase()
    const cached = readSession<Info | 'none'>(key)
    if (cached) return setInfo(cached === 'none' ? null : cached)
    let cancelled = false
    fetch(`/api/catalog/track-info?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`)
      .then((r) => r.json())
      .then((d: { info?: Info }) => {
        writeSession(key, d.info ?? 'none')
        if (!cancelled) setInfo(d.info ?? null)
      })
      .catch(() => !cancelled && setInfo(null))
    return () => {
      cancelled = true
    }
  }, [artist, title])

  const go = (href: string) => {
    onClose()
    onNavigate(href)
  }

  const loading = info === undefined
  const albumHref = linkAlbum ? `/music/library?album=${encodeURIComponent(linkAlbum.id)}` : info ? `/music/album/${info.album.id}` : null
  const albumName = linkAlbum?.title ?? info?.album.title

  const item = 'w-full flex items-center gap-4 px-5 py-3.5 text-left text-white hover:bg-white/5 disabled:opacity-40'
  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Opciones de la canción">
      <button className="absolute inset-0 bg-black/60" onClick={onClose} aria-label="Cerrar" />
      <div className="relative w-full max-w-md rounded-t-3xl bg-surface-1 border-t border-white/10 pb-[max(16px,env(safe-area-inset-bottom))] pt-2">
        <div className="flex items-center gap-3 px-5 py-3 border-b border-white/8">
          <div className="min-w-0 flex-1">
            <p className="text-white font-semibold truncate">{title}</p>
            <p className="text-slate-400 text-sm truncate">{artist}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-surface-2 flex items-center justify-center text-slate-300" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <button className={item} disabled={!albumHref} onClick={() => albumHref && go(albumHref)}>
          {loading && !linkAlbum ? <Loader2 className="w-5 h-5 animate-spin text-slate-400" /> : <Disc3 className="w-5 h-5 text-violet-300" />}
          <span className="min-w-0">
            <span className="block font-semibold">Ir al álbum</span>
            <span className="block text-slate-400 text-xs truncate">
              {albumName ?? (loading ? 'Buscando…' : 'No se encontró el álbum en el catálogo')}
            </span>
          </span>
        </button>
        <button className={item} disabled={!info} onClick={() => info && go(`/music/artist/${info.artist.id}`)}>
          {loading ? <Loader2 className="w-5 h-5 animate-spin text-slate-400" /> : <UserRound className="w-5 h-5 text-violet-300" />}
          <span className="min-w-0">
            <span className="block font-semibold">Ir al artista</span>
            <span className="block text-slate-400 text-xs truncate">{info?.artist.name ?? (loading ? 'Buscando…' : 'No se encontró al artista')}</span>
          </span>
        </button>
        <button className={item} disabled={!info} onClick={() => info && go(`/music/artist/${info.artist.id}#discografia`)}>
          <Library className="w-5 h-5 text-violet-300" />
          <span className="min-w-0">
            <span className="block font-semibold">Ver discografía</span>
            <span className="block text-slate-400 text-xs truncate">Todos los álbumes{info ? ` de ${info.artist.name}` : ''}</span>
          </span>
        </button>
      </div>
    </div>
  )
}
