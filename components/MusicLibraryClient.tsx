'use client'

import { useMemo, useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  Heart,
  Play,
  Plus,
  Search,
  Library,
  User,
  Disc3,
  Music2,
  ArrowLeft,
  X,
  Shuffle,
} from 'lucide-react'
import { useMusicStore, parseTrackMeta } from '@/store/musicStore'
import type { MusicVideo } from '@/lib/youtube-music'

type Tab = 'all' | 'artists' | 'albums'
type SortOrder = 'recent' | 'title' | 'artist'

export default function MusicLibraryClient() {
  const { saved, play, addToQueue, removeSaved, playSaved } = useMusicStore()
  const [mounted, setMounted] = useState(false)
  const [tab, setTab] = useState<Tab>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortOrder>('recent')
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null)
  const [selectedAlbum, setSelectedAlbum] = useState<string | null>(null)

  // Persisted state via zustand is only populated after mount on the client.
  useEffect(() => setMounted(true), [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = saved.slice()

    if (selectedArtist) {
      list = list.filter((t) => (t.artist ?? parseTrackMeta(t).artist) === selectedArtist)
    }
    if (selectedAlbum) {
      list = list.filter((t) => (t.album ?? parseTrackMeta(t).album) === selectedAlbum)
    }
    if (q) {
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.channelTitle.toLowerCase().includes(q) ||
          (t.artist ?? '').toLowerCase().includes(q) ||
          (t.album ?? '').toLowerCase().includes(q)
      )
    }

    if (sort === 'title') list.sort((a, b) => a.title.localeCompare(b.title))
    else if (sort === 'artist')
      list.sort((a, b) => (a.artist ?? '').localeCompare(b.artist ?? ''))
    else list.sort((a, b) => b.savedAt - a.savedAt)

    return list
  }, [saved, query, sort, selectedArtist, selectedAlbum])

  const artists = useMemo(() => {
    const map = new Map<string, { count: number; cover: string }>()
    for (const t of saved) {
      const artist = t.artist ?? parseTrackMeta(t).artist
      const prev = map.get(artist)
      map.set(artist, { count: (prev?.count ?? 0) + 1, cover: prev?.cover ?? t.thumbnail })
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.count - a.count)
  }, [saved])

  const albums = useMemo(() => {
    const map = new Map<string, { artist: string; count: number; cover: string }>()
    for (const t of saved) {
      const meta = parseTrackMeta(t)
      const album = t.album ?? meta.album
      if (!album) continue
      const artist = t.artist ?? meta.artist
      const key = `${album}::${artist}`
      const prev = map.get(key)
      map.set(key, {
        artist,
        count: (prev?.count ?? 0) + 1,
        cover: prev?.cover ?? t.thumbnail,
      })
    }
    return Array.from(map.entries())
      .map(([key, v]) => {
        const [name] = key.split('::')
        return { name, ...v }
      })
      .sort((a, b) => b.count - a.count)
  }, [saved])

  const playList = (videos: MusicVideo[], startIndex = 0) => play(videos, startIndex)

  const clearSubFilters = () => {
    setSelectedArtist(null)
    setSelectedAlbum(null)
  }

  if (!mounted) {
    return (
      <div className="pt-20 min-h-screen bg-black pb-32">
        <div className="max-w-7xl mx-auto px-4 py-12 text-slate-500 text-sm">Cargando biblioteca...</div>
      </div>
    )
  }

  const activeSubFilter = selectedArtist || selectedAlbum

  return (
    <div className="pt-20 min-h-screen bg-black pb-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <Link
              href="/music"
              className="inline-flex items-center gap-1.5 text-slate-500 hover:text-purple-400 text-xs font-medium mb-3 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Volver a Music Station
            </Link>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center shadow-lg shadow-purple-900/30">
                <Library className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl sm:text-4xl font-black text-white leading-tight">Mi biblioteca</h1>
                <p className="text-slate-500 text-sm mt-0.5">
                  {saved.length} {saved.length === 1 ? 'canción guardada' : 'canciones guardadas'}
                </p>
              </div>
            </div>
          </div>

          {saved.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => playSaved(0)}
                className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold px-5 py-2.5 rounded-full text-sm transition-all hover:scale-105 shadow-lg shadow-purple-900/30"
              >
                <Play className="w-4 h-4 fill-white" /> Reproducir todo
              </button>
              <button
                onClick={() => {
                  const idx = Math.floor(Math.random() * saved.length)
                  playSaved(idx)
                }}
                className="inline-flex items-center gap-2 bg-[#0d0d0d] hover:bg-[#151515] text-white font-semibold px-4 py-2.5 rounded-full text-sm border border-white/10 hover:border-purple-500/40 transition-all"
                title="Aleatorio"
              >
                <Shuffle className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Empty state */}
        {saved.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 border border-dashed border-white/10 rounded-2xl">
            <Heart className="w-14 h-14 text-slate-800" />
            <div className="text-center">
              <p className="text-slate-400 text-base font-medium mb-1">Aún no has guardado canciones</p>
              <p className="text-slate-600 text-sm">
                Toca el corazón en cualquier canción para guardarla aquí.
              </p>
            </div>
            <Link
              href="/music"
              className="mt-3 inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold px-5 py-2.5 rounded-full text-sm transition-colors"
            >
              Explorar música
            </Link>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex items-center gap-1 mb-5 border-b border-white/10 overflow-x-auto">
              <TabButton active={tab === 'all'} onClick={() => { setTab('all'); clearSubFilters() }} icon={<Music2 className="w-4 h-4" />} label={`Canciones (${saved.length})`} />
              <TabButton active={tab === 'artists'} onClick={() => { setTab('artists'); clearSubFilters() }} icon={<User className="w-4 h-4" />} label={`Artistas (${artists.length})`} />
              <TabButton active={tab === 'albums'} onClick={() => { setTab('albums'); clearSubFilters() }} icon={<Disc3 className="w-4 h-4" />} label={`Álbumes (${albums.length})`} />
            </div>

            {/* Sub filter chip */}
            {activeSubFilter && (
              <div className="flex items-center gap-2 mb-4">
                <span className="text-slate-500 text-xs">Filtrando por:</span>
                <button
                  onClick={clearSubFilters}
                  className="inline-flex items-center gap-1.5 bg-purple-600/20 text-purple-300 border border-purple-500/30 rounded-full px-3 py-1 text-xs font-medium hover:bg-purple-600/30 transition-colors"
                >
                  {selectedArtist ? `Artista: ${selectedArtist}` : `Álbum: ${selectedAlbum}`}
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* ALL SONGS TAB */}
            {(tab === 'all' || activeSubFilter) && (
              <>
                {/* Search + sort */}
                <div className="flex flex-wrap items-center gap-3 mb-5">
                  <div className="relative flex-1 min-w-[200px] max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Buscar en tu biblioteca..."
                      className="w-full bg-[#0d0d0d] border border-white/10 text-white placeholder-slate-600 rounded-full pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/15 transition-all"
                    />
                  </div>
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as SortOrder)}
                    className="bg-[#0d0d0d] border border-white/10 text-white text-sm rounded-full px-4 py-2.5 focus:outline-none focus:border-purple-500/50 cursor-pointer"
                  >
                    <option value="recent">Añadidas recientemente</option>
                    <option value="title">Título (A-Z)</option>
                    <option value="artist">Artista (A-Z)</option>
                  </select>
                </div>

                {/* Track list */}
                {filtered.length === 0 ? (
                  <div className="text-center py-16 text-slate-600 text-sm">
                    No se encontraron canciones.
                  </div>
                ) : (
                  <ul className="divide-y divide-white/5 border border-white/5 rounded-xl overflow-hidden bg-[#0a0a0a]">
                    {filtered.map((track, idx) => (
                      <li
                        key={track.id}
                        className="group flex items-center gap-3 px-3 sm:px-4 py-2.5 hover:bg-white/5 transition-colors"
                      >
                        <div className="w-6 text-center text-slate-600 text-xs tabular-nums shrink-0 hidden sm:block">
                          {idx + 1}
                        </div>
                        <button
                          onClick={() => playList(filtered, idx)}
                          className="relative w-11 h-11 rounded-lg overflow-hidden shrink-0 bg-[#1a1a1a] group/thumb"
                          title="Reproducir"
                        >
                          {track.thumbnail && (
                            <Image src={track.thumbnail} alt={track.title} fill sizes="44px" className="object-cover" />
                          )}
                          <div className="absolute inset-0 bg-black/0 group-hover/thumb:bg-black/60 flex items-center justify-center transition-colors">
                            <Play className="w-4 h-4 text-white fill-white opacity-0 group-hover/thumb:opacity-100 transition-opacity" />
                          </div>
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className="text-white text-sm font-medium truncate">{track.title}</p>
                          <p className="text-slate-500 text-xs truncate">
                            <button
                              onClick={() => {
                                setTab('artists')
                                setSelectedArtist(track.artist ?? parseTrackMeta(track).artist)
                              }}
                              className="hover:text-purple-400 transition-colors"
                            >
                              {track.artist ?? track.channelTitle}
                            </button>
                            {track.album && (
                              <>
                                <span className="text-slate-700"> · </span>
                                <button
                                  onClick={() => {
                                    setTab('albums')
                                    setSelectedAlbum(track.album!)
                                  }}
                                  className="hover:text-purple-400 transition-colors"
                                >
                                  {track.album}
                                </button>
                              </>
                            )}
                          </p>
                        </div>
                        {track.duration && (
                          <span className="text-slate-600 text-xs font-mono hidden md:block">
                            {track.duration}
                          </span>
                        )}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => addToQueue(track)}
                            className="p-2 text-slate-600 hover:text-purple-400 opacity-0 group-hover:opacity-100 transition-all"
                            title="Añadir a la cola"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => removeSaved(track.id)}
                            className="p-2 text-pink-500 hover:text-pink-400 transition-colors"
                            title="Quitar de guardadas"
                          >
                            <Heart className="w-4 h-4 fill-pink-500" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {/* ARTISTS TAB */}
            {tab === 'artists' && !selectedArtist && !selectedAlbum && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {artists.map((a) => (
                  <button
                    key={a.name}
                    onClick={() => setSelectedArtist(a.name)}
                    className="group text-left bg-[#0d0d0d] border border-white/8 rounded-xl p-4 hover:border-purple-500/30 hover:bg-[#111111] transition-all hover:-translate-y-0.5"
                  >
                    <div className="relative aspect-square rounded-full overflow-hidden mx-auto mb-3 w-28 sm:w-32 bg-[#1a1a1a] shadow-lg">
                      {a.cover ? (
                        <Image src={a.cover} alt={a.name} fill sizes="128px" className="object-cover group-hover:scale-105 transition-transform duration-500" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <User className="w-10 h-10 text-slate-700" />
                        </div>
                      )}
                    </div>
                    <p className="text-white font-semibold text-sm truncate text-center">{a.name}</p>
                    <p className="text-slate-500 text-xs text-center mt-0.5">
                      {a.count} {a.count === 1 ? 'canción' : 'canciones'}
                    </p>
                  </button>
                ))}
              </div>
            )}

            {/* ALBUMS TAB */}
            {tab === 'albums' && !selectedArtist && !selectedAlbum && (
              <>
                {albums.length === 0 ? (
                  <div className="text-center py-16 border border-dashed border-white/10 rounded-xl">
                    <Disc3 className="w-10 h-10 text-slate-800 mx-auto mb-3" />
                    <p className="text-slate-500 text-sm">
                      No detectamos álbumes en tus canciones guardadas todavía.
                    </p>
                    <p className="text-slate-700 text-xs mt-1">
                      Los álbumes se extraen del título del video cuando están disponibles.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {albums.map((al) => (
                      <button
                        key={`${al.name}-${al.artist}`}
                        onClick={() => setSelectedAlbum(al.name)}
                        className="group text-left bg-[#0d0d0d] border border-white/8 rounded-xl overflow-hidden hover:border-purple-500/30 hover:bg-[#111111] transition-all hover:-translate-y-0.5"
                      >
                        <div className="relative aspect-square bg-[#1a1a1a]">
                          {al.cover ? (
                            <Image src={al.cover} alt={al.name} fill sizes="(max-width: 640px) 50vw, 25vw" className="object-cover group-hover:scale-105 transition-transform duration-500" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Disc3 className="w-12 h-12 text-slate-700" />
                            </div>
                          )}
                        </div>
                        <div className="p-3">
                          <p className="text-white font-semibold text-sm truncate">{al.name}</p>
                          <p className="text-slate-500 text-xs truncate mt-0.5">{al.artist}</p>
                          <p className="text-slate-700 text-xs mt-0.5">
                            {al.count} {al.count === 1 ? 'canción' : 'canciones'}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold transition-colors border-b-2 whitespace-nowrap ${
        active
          ? 'text-white border-purple-500'
          : 'text-slate-500 border-transparent hover:text-white'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
