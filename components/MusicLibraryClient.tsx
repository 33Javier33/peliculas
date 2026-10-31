'use client'

import AudioLinksSection from '@/components/AudioLinksSection'
import ArchiveSearchSection from '@/components/ArchiveSearchSection'
import { useShallow } from 'zustand/react/shallow'
import { TrackStateOverlay } from '@/components/TrackState'
import LocalMusicSection from '@/components/LocalMusicSection'
import FollowedArtistsSection from '@/components/FollowedArtistsSection'
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
  List,
  LayoutGrid,
  ListPlus,
  ListMusic,
} from 'lucide-react'
import { useMusicStore, parseTrackMeta, type SavedTrack } from '@/store/musicStore'
import { useLinksStore } from '@/store/linksStore'
import { usePlaylistStore } from '@/store/playlistStore'
import ViewToggle, { useView } from '@/components/ViewToggle'
import PlaylistCover from '@/components/PlaylistCover'
import type { MusicVideo } from '@/lib/youtube-music'
import BackButton from '@/components/BackButton'

type Tab = 'all' | 'artists' | 'albums' | 'playlists'
type SortOrder = 'recent' | 'title' | 'artist'

export default function MusicLibraryClient() {
  const { liked, play, addToQueue, removeLiked, queue, currentIndex, isVisible, isPlaying } = useMusicStore(
    useShallow((s) => ({
      liked: s.saved,
      play: s.play,
      addToQueue: s.addToQueue,
      removeLiked: s.removeSaved,
      queue: s.queue,
      currentIndex: s.currentIndex,
      isVisible: s.isVisible,
      isPlaying: s.isPlaying,
    }))
  )
  const currentId = isVisible ? queue[currentIndex]?.id : undefined
  // La biblioteca junta las canciones guardadas con corazón y los discos agregados desde enlaces
  // o Internet Archive (así aparecen también en Canciones, Artistas y Álbumes)
  const linkTracks = useLinksStore((s) => s.tracks)
  const linkAlbums = useLinksStore((s) => s.albums)
  const removeLinkTrack = useLinksStore((s) => s.removeTrack)
  const saved = useMemo<SavedTrack[]>(() => {
    const addedAt = new Map<string, number>()
    for (const a of linkAlbums) a.trackIds.forEach((id, i) => addedAt.set(id, a.addedAt - i))
    const known = new Set(liked.map((t) => t.id))
    const fromLinks = linkTracks
      .filter((t) => !known.has(t.id))
      .map((t, i) => ({ ...t, artist: t.channelTitle, album: t.album, savedAt: addedAt.get(t.id) ?? -i }))
    return [...liked, ...fromLinks]
  }, [liked, linkTracks, linkAlbums])
  const removeSaved = (id: string) => (linkTracks.some((t) => t.id === id) && !liked.some((t) => t.id === id) ? removeLinkTrack(id) : removeLiked(id))
  const playSaved = (index: number) => {
    const list = [...saved].sort((a, b) => b.savedAt - a.savedAt)
    if (list.length) play(list, index)
  }
  const [mounted, setMounted] = useState(false)
  // Vista Lista o Mosaico: la misma en todas las secciones
  const view = useView()
  const playlists = usePlaylistStore((s) => s.playlists)
  const openAdd = usePlaylistStore((s) => s.openAdd)
  const [tab, setTab] = useState<Tab>('all')
  // /music/library?tab=playlists abre directo las playlists
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('tab') === 'playlists') setTab('playlists')
  }, [])
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
      <div className="pt-20 min-h-screen bg-obsidian pb-32">
        <div className="max-w-7xl mx-auto px-4 py-12 text-slate-500 text-sm">Cargando biblioteca...</div>
      </div>
    )
  }

  const activeSubFilter = selectedArtist || selectedAlbum

  return (
    <div className="pt-20 min-h-screen bg-obsidian pb-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <BackButton
              fallbackHref="/music"
              className="inline-flex items-center gap-1.5 text-slate-500 hover:text-violet-400 text-xs font-medium mb-3 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Volver
            </BackButton>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-900/30">
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
                className="inline-flex items-center gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-bold px-5 py-2.5 rounded-full text-sm transition-all hover:scale-105 shadow-lg shadow-violet-900/30"
              >
                <Play className="w-4 h-4 fill-white" /> Reproducir todo
              </button>
              <button
                onClick={() => {
                  const idx = Math.floor(Math.random() * saved.length)
                  playSaved(idx)
                }}
                className="inline-flex items-center gap-2 bg-surface-1 hover:bg-surface-2 text-white font-semibold px-4 py-2.5 rounded-full text-sm border border-white/10 hover:border-violet-500/40 transition-all"
                title="Aleatorio"
              >
                <Shuffle className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        <LocalMusicSection />

        <ArchiveSearchSection />

        <ArchiveSearchSection variant="free" />

        <AudioLinksSection />

        <FollowedArtistsSection showEmpty />

        {/* Empty state */}
        {saved.length === 0 && playlists.length === 0 ? (
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
              className="mt-3 inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white font-semibold px-5 py-2.5 rounded-full text-sm transition-colors"
            >
              Explorar música
            </Link>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1 [scrollbar-width:none]">
              <TabButton active={tab === 'all'} onClick={() => { setTab('all'); clearSubFilters() }} icon={<Music2 className="w-4 h-4" />} label={`Canciones (${saved.length})`} />
              <TabButton active={tab === 'artists'} onClick={() => { setTab('artists'); clearSubFilters() }} icon={<User className="w-4 h-4" />} label={`Artistas (${artists.length})`} />
              <TabButton active={tab === 'albums'} onClick={() => { setTab('albums'); clearSubFilters() }} icon={<Disc3 className="w-4 h-4" />} label={`Álbumes (${albums.length})`} />
              <TabButton active={tab === 'playlists'} onClick={() => { setTab('playlists'); clearSubFilters() }} icon={<ListMusic className="w-4 h-4" />} label={`Playlists (${playlists.length})`} />
            </div>
            <div className="flex justify-end -mt-2 mb-4">
              <ViewToggle />
            </div>

            {/* Sub filter chip */}
            {activeSubFilter && (
              <div className="flex items-center gap-2 mb-4">
                <span className="text-slate-500 text-xs">Filtrando por:</span>
                <button
                  onClick={clearSubFilters}
                  className="inline-flex items-center gap-1.5 bg-violet-600/20 text-violet-300 border border-violet-500/30 rounded-full px-3 py-1 text-xs font-medium hover:bg-violet-600/30 transition-colors"
                >
                  {selectedArtist ? `Artista: ${selectedArtist}` : `Álbum: ${selectedAlbum}`}
                  <X className="w-3 h-3" />
                </button>
                <button
                  onClick={() => openAdd(filtered)}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border border-white/10 text-slate-300 hover:text-white"
                >
                  <ListPlus className="w-3.5 h-3.5" /> Todas a una playlist
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
                      className="w-full bg-surface-1 border border-white/10 text-white placeholder-slate-600 rounded-full pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/15 transition-all"
                    />
                  </div>
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as SortOrder)}
                    className="bg-surface-1 border border-white/10 text-white text-sm rounded-full px-4 py-2.5 focus:outline-none focus:border-violet-500/50 cursor-pointer"
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
                ) : view === 'grid' ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                    {filtered.map((track, idx) => {
                      const isCurrent = currentId === track.id
                      return (
                        <div
                          key={track.id}
                          className={`group relative rounded-xl overflow-hidden border transition-colors shadow-rim ${
                            isCurrent ? 'bg-violet-500/15 border-violet-500/50' : 'bg-surface-1 border-white/8 hover:border-violet-500/30'
                          }`}
                        >
                          <button onClick={() => playList(filtered, idx)} className="block w-full text-left">
                            <div className="relative aspect-square bg-surface-2">
                              {track.thumbnail && (
                                <Image
                                  src={track.thumbnail}
                                  alt={track.title}
                                  fill
                                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                                  className="object-cover group-hover:scale-105 transition-transform duration-500"
                                />
                              )}
                              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                              <TrackStateOverlay id={track.id} />
                              <span className="absolute right-2 bottom-2 w-9 h-9 rounded-full bg-violet-500 shadow-glow flex items-center justify-center">
                                {isCurrent && isPlaying ? (
                                  <span className="flex items-end gap-[2px] h-3.5">
                                    {[0, 150, 300].map((d) => (
                                      <span key={d} className="w-[3px] h-full bg-white rounded-full origin-bottom animate-eq" style={{ animationDelay: `${d}ms` }} />
                                    ))}
                                  </span>
                                ) : (
                                  <Play className="w-4 h-4 text-white fill-white ml-0.5" />
                                )}
                              </span>
                              {track.duration && (
                                <span className="absolute left-2 bottom-2 text-[10px] font-mono text-white/90 bg-black/60 px-1.5 py-0.5 rounded">
                                  {track.duration}
                                </span>
                              )}
                            </div>
                            <div className="p-2.5">
                              <p className={`text-sm leading-tight font-semibold font-display line-clamp-2 ${isCurrent ? 'text-emerald-400' : 'text-white'}`}>
                                {track.title.replace(/^[^-–]+[-–]\s*/, '') || track.title}
                              </p>
                              <p className="text-slate-400 text-xs truncate mt-0.5">{track.artist ?? track.channelTitle}</p>
                            </div>
                          </button>
                          <div className="absolute right-1.5 top-1.5 flex items-center gap-1">
                            <button
                              onClick={() => openAdd([track])}
                              className="w-8 h-8 rounded-full bg-black/55 backdrop-blur-md flex items-center justify-center text-white hover:text-violet-300"
                              aria-label="Agregar a playlist"
                              title="Agregar a playlist"
                            >
                              <ListPlus className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => addToQueue(track)}
                              className="w-8 h-8 rounded-full bg-black/55 backdrop-blur-md flex items-center justify-center text-white hover:text-violet-300"
                              aria-label="Añadir a la cola"
                              title="Añadir a la cola"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => removeSaved(track.id)}
                              className="w-8 h-8 rounded-full bg-black/55 backdrop-blur-md flex items-center justify-center text-purple-400 hover:text-purple-300"
                              aria-label="Quitar de guardadas"
                              title="Quitar de guardadas"
                            >
                              <Heart className="w-4 h-4 fill-purple-400" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <ul className="divide-y divide-white/5 border border-white/5 rounded-xl overflow-hidden bg-obsidian">
                    {filtered.map((track, idx) => (
                      // Toda la fila pone a sonar la canción (los botones de la fila hacen lo suyo)
                      <li
                        key={track.id}
                        onClick={() => playList(filtered, idx)}
                        className={`group flex items-center gap-3 px-3 sm:px-4 py-2.5 cursor-pointer hover:bg-white/5 active:bg-white/10 transition-colors ${track.id === currentId ? 'bg-emerald-500/5' : ''}`}
                      >
                        <div className="w-6 text-center text-slate-600 text-xs tabular-nums shrink-0 hidden sm:block">
                          {idx + 1}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            playList(filtered, idx)
                          }}
                          className="relative w-11 h-11 rounded-lg overflow-hidden shrink-0 bg-surface-2 group/thumb"
                          title="Reproducir"
                        >
                          {track.thumbnail && (
                            <Image src={track.thumbnail} alt={track.title} fill sizes="44px" className="object-cover" />
                          )}
                          <div className="absolute inset-0 bg-black/0 group-hover/thumb:bg-black/60 flex items-center justify-center transition-colors">
                            <Play className="w-4 h-4 text-white fill-white opacity-0 group-hover/thumb:opacity-100 transition-opacity" />
                          </div>
                          <TrackStateOverlay id={track.id} size="sm" />
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-medium truncate ${track.id === currentId ? 'text-emerald-400' : 'text-white'}`}>
                            {track.title.replace(/^[^-–]+[-–]\s*/, '') || track.title}
                          </p>
                          <p className="text-slate-500 text-xs truncate">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setTab('artists')
                                setSelectedArtist(track.artist ?? parseTrackMeta(track).artist)
                              }}
                              className="hover:text-violet-400 transition-colors"
                            >
                              {track.artist ?? track.channelTitle}
                            </button>
                            {track.album && (
                              <>
                                <span className="text-slate-700"> · </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setTab('albums')
                                    setSelectedAlbum(track.album!)
                                  }}
                                  className="hover:text-violet-400 transition-colors"
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
                            onClick={(e) => {
                              e.stopPropagation()
                              openAdd([track])
                            }}
                            className="p-2 text-slate-500 hover:text-violet-400 transition-colors"
                            title="Agregar a playlist"
                            aria-label="Agregar a playlist"
                          >
                            <ListPlus className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              addToQueue(track)
                            }}
                            className="p-2 text-slate-600 hover:text-violet-400 opacity-0 group-hover:opacity-100 transition-all"
                            title="Añadir a la cola"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              removeSaved(track.id)
                            }}
                            className="p-2 text-purple-500 hover:text-purple-400 transition-colors"
                            title="Quitar de guardadas"
                          >
                            <Heart className="w-4 h-4 fill-purple-500" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {/* ARTISTS TAB */}
            {tab === 'artists' && !selectedArtist && !selectedAlbum && view === 'list' && (
              <ul className="divide-y divide-white/5 border border-white/5 rounded-xl overflow-hidden bg-obsidian">
                {artists.map((a) => (
                  <li key={a.name} onClick={() => setSelectedArtist(a.name)} className="flex items-center gap-3 px-3 sm:px-4 py-2.5 cursor-pointer hover:bg-white/5 active:bg-white/10">
                    <span className="relative w-12 h-12 rounded-full overflow-hidden shrink-0 bg-surface-2 flex items-center justify-center">
                      {a.cover ? <Image src={a.cover} alt="" fill sizes="48px" className="object-cover" /> : <User className="w-5 h-5 text-slate-600" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-white text-sm font-semibold truncate">{a.name}</span>
                      <span className="block text-slate-500 text-xs">
                        {a.count} {a.count === 1 ? 'canción' : 'canciones'}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {tab === 'artists' && !selectedArtist && !selectedAlbum && view === 'grid' && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {artists.map((a) => (
                  <button
                    key={a.name}
                    onClick={() => setSelectedArtist(a.name)}
                    className="group text-left bg-surface-1 border border-white/8 rounded-xl p-4 hover:border-violet-500/30 hover:bg-surface-1 transition-all hover:-translate-y-0.5"
                  >
                    <div className="relative aspect-square rounded-full overflow-hidden mx-auto mb-3 w-28 sm:w-32 bg-surface-2 shadow-lg">
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
                ) : view === 'list' ? (
                  <ul className="divide-y divide-white/5 border border-white/5 rounded-xl overflow-hidden bg-obsidian">
                    {albums.map((al) => (
                      <li
                        key={`${al.name}-${al.artist}`}
                        onClick={() => setSelectedAlbum(al.name)}
                        className="flex items-center gap-3 px-3 sm:px-4 py-2.5 cursor-pointer hover:bg-white/5 active:bg-white/10"
                      >
                        <span className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-surface-2 flex items-center justify-center">
                          {al.cover ? <Image src={al.cover} alt="" fill sizes="48px" className="object-cover" /> : <Disc3 className="w-5 h-5 text-slate-600" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-white text-sm font-semibold truncate">{al.name}</span>
                          <span className="block text-slate-500 text-xs truncate">
                            {al.artist} · {al.count} {al.count === 1 ? 'canción' : 'canciones'}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {albums.map((al) => (
                      <button
                        key={`${al.name}-${al.artist}`}
                        onClick={() => setSelectedAlbum(al.name)}
                        className="group text-left bg-surface-1 border border-white/8 rounded-xl overflow-hidden hover:border-violet-500/30 hover:bg-surface-1 transition-all hover:-translate-y-0.5"
                      >
                        <div className="relative aspect-square bg-surface-2">
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
            {/* PLAYLISTS TAB */}
            {tab === 'playlists' && !selectedArtist && !selectedAlbum && <PlaylistsTab view={view} />}
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
      className={`shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold font-display transition-colors whitespace-nowrap ${
        active
          ? 'bg-violet-300 text-violet-950'
          : 'bg-surface-2/60 border border-white/8 text-slate-300 hover:text-white'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function PlaylistsTab({ view }: { view: 'list' | 'grid' }) {
  const playlists = usePlaylistStore((s) => s.playlists)
  const create = usePlaylistStore((s) => s.create)
  const [name, setName] = useState('')
  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          create(name.trim() || `Mi playlist ${playlists.length + 1}`)
          setName('')
        }}
        className="flex gap-2 mb-4 max-w-md"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre de una playlist nueva"
          aria-label="Nombre de la playlist nueva"
          maxLength={60}
          className="min-w-0 flex-1 bg-surface-1 border border-white/10 text-white placeholder-slate-600 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:border-violet-500/50"
        />
        <button type="submit" className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-violet-500 text-white text-sm font-semibold">
          <Plus className="w-4 h-4" /> Crear
        </button>
      </form>
      {playlists.length === 0 ? (
        <div className="text-center py-14 border border-dashed border-white/10 rounded-xl text-slate-500 text-sm px-4">
          Crea una playlist aquí o, en cualquier canción, toca el botón <ListPlus className="inline w-4 h-4 -mt-0.5" /> (o ⋮ en el reproductor).
        </div>
      ) : view === 'list' ? (
        <ul className="divide-y divide-white/5 border border-white/5 rounded-xl overflow-hidden bg-obsidian">
          {playlists.map((p) => (
            <li key={p.id}>
              <Link href={`/music/playlist/${p.id}`} className="flex items-center gap-3 px-3 sm:px-4 py-2.5 hover:bg-white/5 active:bg-white/10">
                <PlaylistCover tracks={p.tracks} className="w-12 h-12 rounded-lg shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-white text-sm font-semibold truncate">{p.name}</span>
                  <span className="block text-slate-500 text-xs">
                    Playlist · {p.tracks.length} {p.tracks.length === 1 ? 'canción' : 'canciones'}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {playlists.map((p) => (
            <Link key={p.id} href={`/music/playlist/${p.id}`} className="group bg-surface-1 border border-white/8 rounded-xl overflow-hidden hover:border-violet-500/30">
              <PlaylistCover tracks={p.tracks} className="aspect-square w-full" />
              <span className="block p-3">
                <span className="block text-white font-semibold text-sm truncate">{p.name}</span>
                <span className="block text-slate-500 text-xs mt-0.5">
                  {p.tracks.length} {p.tracks.length === 1 ? 'canción' : 'canciones'}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
