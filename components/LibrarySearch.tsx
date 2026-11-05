'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Search, X, User, Disc3, Music2, ListMusic, Play } from 'lucide-react'
import type { MusicVideo } from '@/lib/youtube-music'
import { usePlaylistStore } from '@/store/playlistStore'
import { useMusicStore } from '@/store/musicStore'

// Buscador de tu biblioteca: artistas, álbumes, canciones y playlists que tienes guardados
// (♥, álbumes guardados, discos de archive.org y enlaces, y descargas). Sin internet.

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()

export default function LibrarySearch({
  songs,
  artists,
  albums,
  artistOf,
  albumOf,
  onArtist,
  onAlbum,
}: {
  songs: MusicVideo[]
  artists: { name: string; count: number; cover: string }[]
  albums: { name: string; artist: string; count: number; cover: string }[]
  artistOf: (t: MusicVideo) => string
  albumOf: (t: MusicVideo) => string
  onArtist: (name: string) => void
  onAlbum: (al: { name: string; artist: string }) => void
}) {
  const [q, setQ] = useState('')
  const playlists = usePlaylistStore((s) => s.playlists)
  const res = useMemo(() => {
    const n = norm(q)
    if (n.length < 2) return null
    const has = (s?: string) => !!s && norm(s).includes(n)
    // Primero lo que empieza con lo escrito
    const rank = (s: string) => (norm(s).startsWith(n) ? 0 : 1)
    return {
      artists: artists.filter((a) => has(a.name)).sort((a, b) => rank(a.name) - rank(b.name)).slice(0, 8),
      albums: albums.filter((a) => has(a.name) || has(a.artist)).sort((a, b) => rank(a.name) - rank(b.name)).slice(0, 8),
      songs: songs
        .filter((t) => has(t.title) || has(artistOf(t)) || has(albumOf(t)))
        .sort((a, b) => rank(a.title.replace(/^.+?\s[-–—]\s/, '')) - rank(b.title.replace(/^.+?\s[-–—]\s/, '')))
        .slice(0, 30),
      playlists: playlists.filter((p) => has(p.name) || p.tracks.some((t) => has(t.title))).slice(0, 6),
    }
  }, [q, songs, artists, albums, playlists, artistOf, albumOf])
  const total = res ? res.artists.length + res.albums.length + res.songs.length + res.playlists.length : 0
  const head = 'flex items-center gap-1.5 text-slate-400 text-xs font-bold uppercase tracking-[0.08em] font-display mb-2 mt-4'
  const done = () => setQ('')

  return (
    <div className="mb-5">
      <div className="relative max-w-xl">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          inputMode="search"
          enterKeyHint="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Busca en tu biblioteca: artistas, álbumes, canciones…"
          className="w-full bg-surface-1 border border-white/10 text-white placeholder-slate-500 rounded-full pl-10 pr-10 py-3 text-sm focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/15"
          aria-label="Buscar en tu biblioteca"
        />
        {q && (
          <button onClick={done} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full text-slate-400 hover:text-white flex items-center justify-center" aria-label="Borrar búsqueda">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {res && (
        <div className="mt-2 rounded-2xl bg-surface-1/70 border border-white/8 p-3 sm:p-4">
          {total === 0 && <p className="text-slate-500 text-sm">No tienes nada guardado que coincida con «{q}».</p>}
          {res.artists.length > 0 && (
            <>
              <p className={head}>
                <User className="w-3.5 h-3.5" /> Artistas
              </p>
              <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
                {res.artists.map((a) => (
                  <button key={a.name} onClick={() => (onArtist(a.name), done())} className="shrink-0 w-20 text-center">
                    <span className="relative block w-20 h-20 rounded-full overflow-hidden bg-surface-2">
                      {a.cover && <Image src={a.cover} alt="" fill sizes="80px" className="object-cover" />}
                    </span>
                    <span className="block text-white text-xs font-semibold mt-1 line-clamp-2">{a.name}</span>
                    <span className="block text-slate-500 text-[10px]">{a.count} canc.</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {res.albums.length > 0 && (
            <>
              <p className={head}>
                <Disc3 className="w-3.5 h-3.5" /> Álbumes
              </p>
              <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
                {res.albums.map((a) => (
                  <button key={`${a.name}-${a.artist}`} onClick={() => (onAlbum(a), done())} className="shrink-0 w-28 text-left">
                    <span className="relative block w-28 h-28 rounded-xl overflow-hidden bg-surface-2 flex items-center justify-center">
                      {a.cover ? <Image src={a.cover} alt="" fill sizes="112px" className="object-cover" /> : <Disc3 className="w-8 h-8 text-slate-600" />}
                    </span>
                    <span className="block text-white text-xs font-semibold mt-1 truncate">{a.name}</span>
                    <span className="block text-slate-500 text-[10px] truncate">{a.artist}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {res.songs.length > 0 && (
            <>
              <p className={head}>
                <Music2 className="w-3.5 h-3.5" /> Canciones
              </p>
              <ul className="divide-y divide-white/5">
                {res.songs.map((t, i) => (
                  <li key={t.id}>
                    <button onClick={() => useMusicStore.getState().play(res.songs, i)} className="w-full flex items-center gap-3 py-2 text-left hover:bg-white/5 rounded-lg px-1">
                      <span className="relative w-10 h-10 rounded-lg overflow-hidden bg-surface-2 shrink-0">
                        {t.thumbnail && <Image src={t.thumbnail} alt="" fill sizes="40px" className="object-cover" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-white text-sm truncate">{t.title.replace(/^.+?\s[-–—]\s/, '') || t.title}</span>
                        <span className="block text-slate-500 text-xs truncate">{[artistOf(t), albumOf(t)].filter(Boolean).join(' · ')}</span>
                      </span>
                      <Play className="w-4 h-4 text-violet-300 shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {res.playlists.length > 0 && (
            <>
              <p className={head}>
                <ListMusic className="w-3.5 h-3.5" /> Playlists
              </p>
              <div className="flex flex-wrap gap-2">
                {res.playlists.map((p) => (
                  <Link key={p.id} href={`/music/playlist/${p.id}`} className="px-3 py-1.5 rounded-full bg-surface-2 border border-white/10 text-white text-xs font-semibold">
                    {p.name} <span className="text-slate-500">({p.tracks.length})</span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
