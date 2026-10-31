'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Play, Shuffle, Loader2, ListPlus, Check, ListMusic } from 'lucide-react'
import { readSharedPlaylist } from '@/lib/share'
import { usePlaylistStore } from '@/store/playlistStore'
import { useMusicStore } from '@/store/musicStore'
import PlaylistCover from '@/components/PlaylistCover'
import ViewToggle, { useView } from '@/components/ViewToggle'
import TrackTiles from '@/components/TrackTiles'
import type { MusicVideo } from '@/lib/youtube-music'

// Playlist que alguien compartió: se escucha aquí y se puede guardar en las playlists propias
export default function SharedPlaylistClient() {
  const router = useRouter()
  const view = useView()
  const [data, setData] = useState<{ name: string; tracks: MusicVideo[] } | null | undefined>(undefined)
  const create = usePlaylistStore((s) => s.create)
  const openAdd = usePlaylistStore((s) => s.openAdd)
  const [savedId, setSavedId] = useState<string | null>(null)

  useEffect(() => {
    readSharedPlaylist(window.location.hash.slice(1)).then(setData)
  }, [])

  if (data === undefined)
    return (
      <div className="pt-32 min-h-screen flex justify-center">
        <Loader2 className="w-8 h-8 text-violet-300 animate-spin" />
      </div>
    )
  if (!data || !data.tracks.length)
    return (
      <div className="pt-32 min-h-screen text-center px-4">
        <ListMusic className="w-12 h-12 text-slate-700 mx-auto mb-3" />
        <p className="text-slate-300">Este enlace de playlist no está completo.</p>
        <Link href="/music" className="inline-block mt-4 text-violet-300 underline">
          Ir a Música
        </Link>
      </div>
    )

  const { name, tracks } = data
  const play = (index: number, shuffle?: boolean) => {
    const st = useMusicStore.getState()
    if (shuffle !== undefined && shuffle !== st.shuffle) st.toggleShuffle()
    st.play(tracks, shuffle ? Math.floor(Math.random() * tracks.length) : index)
  }

  return (
    <div className="pt-20 min-h-screen bg-obsidian pb-40">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <p className="inline-flex items-center gap-2 text-emerald-400 text-[11px] font-bold uppercase tracking-[0.08em] font-display mb-4">
          <span className="w-2 h-2 rounded-full bg-emerald-400" /> Te compartieron una playlist
        </p>
        <div className="flex flex-col sm:flex-row sm:items-end gap-5 mb-6">
          <PlaylistCover tracks={tracks} className="w-40 h-40 sm:w-48 sm:h-48 rounded-2xl shadow-2xl shadow-violet-900/40 shrink-0 mx-auto sm:mx-0" />
          <div className="min-w-0 flex-1">
            <p className="text-slate-500 text-xs font-bold uppercase tracking-[0.12em]">Playlist</p>
            <h1 className="text-3xl sm:text-4xl font-black text-white leading-tight break-words">{name}</h1>
            <p className="text-slate-400 text-sm mt-1">
              {tracks.length} {tracks.length === 1 ? 'canción' : 'canciones'}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-4">
              <button onClick={() => play(0, false)} className="inline-flex items-center gap-2 bg-violet-500 text-white font-bold px-5 py-2.5 rounded-full text-sm">
                <Play className="w-4 h-4 fill-white" /> Reproducir
              </button>
              <button onClick={() => play(0, true)} className="inline-flex items-center gap-2 bg-surface-1 border border-white/10 text-white font-semibold px-4 py-2.5 rounded-full text-sm">
                <Shuffle className="w-4 h-4" /> Aleatorio
              </button>
              {savedId ? (
                <button onClick={() => router.push(`/music/playlist/${savedId}`)} className="inline-flex items-center gap-2 bg-emerald-500/15 border border-emerald-400/40 text-emerald-300 font-semibold px-4 py-2.5 rounded-full text-sm">
                  <Check className="w-4 h-4" /> Guardada · abrir
                </button>
              ) : (
                <button onClick={() => setSavedId(create(name, tracks))} className="inline-flex items-center gap-2 bg-surface-1 border border-white/10 text-white font-semibold px-4 py-2.5 rounded-full text-sm">
                  <ListPlus className="w-4 h-4" /> Guardar en mis playlists
                </button>
              )}
              <span className="ml-auto">
                <ViewToggle />
              </span>
            </div>
          </div>
        </div>
        <TrackTiles
          tracks={tracks}
          view={view}
          numbered
          onPlay={(i) => play(i)}
          actions={(t) => (
            <button onClick={() => openAdd([t])} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-white bg-black/40 sm:bg-transparent" aria-label="Agregar a una de mis playlists">
              <ListPlus className="w-4 h-4" />
            </button>
          )}
        />
      </div>
    </div>
  )
}
