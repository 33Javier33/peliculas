'use client'

import { useEffect, useState } from 'react'
import { useSwipeDown } from '@/lib/use-swipe-down'
import SheetHandle from '@/components/SheetHandle'
import { Disc3, UserRound, Library, Loader2, X, ListPlus, Play } from 'lucide-react'
import { usePlaylistStore } from '@/store/playlistStore'
import SongDownloadButton from '@/components/SongDownloadButton'
import { useLinksStore } from '@/store/linksStore'
import { useMusicStore } from '@/store/musicStore'
import { readSession, writeSession } from '@/lib/session-cache'
import type { MusicVideo } from '@/lib/youtube-music'

type Info = {
  album: { id: number; title: string; cover: string } | null
  artist: { id: number; name: string }
} | null

export default function VideoMenu({
  video,
  channelTitle,
  title,
  onClose,
  onNavigate,
}: {
  video: MusicVideo
  channelTitle: string
  title: string
  onClose: () => void
  onNavigate: (href: string) => void
}) {
  const [info, setInfo] = useState<Info | undefined>(undefined)
  const savedAlbum = useMusicStore((s) => s.savedAlbums.find((a) => /^deezer-\d+$/.test(a.id) && a.tracks.some((t) => t.id === video.id)))

  useEffect(() => {
    const key = `video-info:${channelTitle}|${title}`.toLowerCase()
    const cached = readSession<Info | 'none'>(key)
    if (cached && cached !== 'none') return setInfo(cached)
    let cancelled = false
    fetch(`/api/catalog/track-info?artist=${encodeURIComponent(channelTitle)}&title=${encodeURIComponent(title)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { info?: Info }) => {
        if (d.info) writeSession(key, d.info)
        if (!cancelled) setInfo(d.info ?? null)
      })
      .catch(() => !cancelled && setInfo(null))
    return () => {
      cancelled = true
    }
  }, [channelTitle, title])

  const go = (href: string) => {
    onClose()
    onNavigate(href)
  }

  const swipe = useSwipeDown(onClose)
  const loading = info === undefined
  const albumHref = savedAlbum
    ? `/music/album/${savedAlbum.id.slice(7)}`
    : info?.album
      ? `/music/album/${info.album.id}`
      : null
  const albumName = savedAlbum?.title ?? info?.album?.title

  const item = 'w-full flex items-center gap-4 px-5 py-3.5 text-left text-white hover:bg-white/5 disabled:opacity-40'
  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Opciones del video">
      <button className="absolute inset-0 bg-black/60" onClick={onClose} aria-label="Cerrar" />
      <div style={swipe.style} className="relative w-full max-w-md rounded-t-3xl bg-surface-1 border-t border-white/10 pb-[max(16px,env(safe-area-inset-bottom))] pt-2">
        <SheetHandle className="sm:hidden -mb-2" />
        <div {...swipe.dragProps} className="flex items-center gap-3 px-5 py-3 border-b border-white/8">
          <div className="min-w-0 flex-1">
            <p className="text-white font-semibold truncate">{title}</p>
            <p className="text-slate-400 text-sm truncate">{channelTitle}</p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-surface-2 flex items-center justify-center text-slate-300"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <button
          className={item}
          onClick={() => {
            onClose()
            usePlaylistStore.getState().openAdd([video])
          }}
        >
          <ListPlus className="w-5 h-5 text-violet-300" />
          <span className="min-w-0">
            <span className="block font-semibold">Agregar a playlist</span>
            <span className="block text-slate-400 text-xs truncate">Guárdalo en una de tus listas</span>
          </span>
        </button>
        <div className="px-5 py-2">
          <SongDownloadButton video={video} className="w-full" />
        </div>

        <button className={item} disabled={!albumHref} onClick={() => albumHref && go(albumHref)}>
          {loading && !savedAlbum ? (
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          ) : (
            <Disc3 className="w-5 h-5 text-violet-300" />
          )}
          <span className="min-w-0">
            <span className="block font-semibold">Ir al álbum</span>
            <span className="block text-slate-400 text-xs truncate">
              {albumName ?? (loading ? 'Buscando…' : 'No se encontró el álbum')}
            </span>
          </span>
        </button>
        <button className={item} disabled={!info} onClick={() => info && go(`/music/artist/${info.artist.id}`)}>
          {loading ? <Loader2 className="w-5 h-5 animate-spin text-slate-400" /> : <UserRound className="w-5 h-5 text-violet-300" />}
          <span className="min-w-0">
            <span className="block font-semibold">Ir al artista</span>
            <span className="block text-slate-400 text-xs truncate">
              {info?.artist.name ?? (loading ? 'Buscando…' : 'No se encontró')}
            </span>
          </span>
        </button>
        <button className={item} disabled={!info} onClick={() => info && go(`/music/artist/${info.artist.id}#discografia`)}>
          <Library className="w-5 h-5 text-violet-300" />
          <span className="min-w-0">
            <span className="block font-semibold">Ver discografía</span>
            <span className="block text-slate-400 text-xs truncate">Todos los álbumes{info ? ` de ${info.artist.name}` : ''}</span>
          </span>
        </button>
        <button className={item} onClick={() => go(`/music/videos?q=${encodeURIComponent(channelTitle)}`)}>
          <Play className="w-5 h-5 text-violet-300" />
          <span className="min-w-0">
            <span className="block font-semibold">Más videos del artista</span>
            <span className="block text-slate-400 text-xs truncate">Videos de {channelTitle}</span>
          </span>
        </button>
      </div>
    </div>
  )
}
