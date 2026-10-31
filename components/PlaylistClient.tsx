'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Play, Shuffle, Pencil, Trash2, ArrowUp, ArrowDown, X, ListMusic, Check } from 'lucide-react'
import { usePlaylistStore } from '@/store/playlistStore'
import { useMusicStore } from '@/store/musicStore'
import PlaylistCover from '@/components/PlaylistCover'
import ViewToggle, { useView } from '@/components/ViewToggle'
import TrackTiles from '@/components/TrackTiles'
import BackButton from '@/components/BackButton'

// Una playlist: reproducir en orden o aleatorio, cambiar el nombre, ordenar y quitar canciones
export default function PlaylistClient({ id }: { id: string }) {
  const router = useRouter()
  const playlist = usePlaylistStore((s) => s.playlists.find((p) => p.id === id))
  const { rename, remove, removeTrack, moveTrack } = usePlaylistStore.getState()
  const view = useView()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (!mounted) return <div className="pt-20 min-h-screen bg-obsidian" />
  if (!playlist)
    return (
      <div className="pt-24 min-h-screen bg-obsidian text-center px-4">
        <ListMusic className="w-12 h-12 text-slate-700 mx-auto mb-3" />
        <p className="text-slate-400">Esta playlist no existe en este teléfono.</p>
        <Link href="/music/library?tab=playlists" className="inline-block mt-4 text-violet-300 underline">
          Ver mis playlists
        </Link>
      </div>
    )

  const tracks = playlist.tracks
  const play = (index: number, shuffle?: boolean) => {
    if (!tracks.length) return
    const st = useMusicStore.getState()
    if (shuffle !== undefined && shuffle !== st.shuffle) st.toggleShuffle()
    st.play(tracks, shuffle ? Math.floor(Math.random() * tracks.length) : index)
  }
  const minutes = Math.round(
    tracks.reduce((sum, t) => {
      const p = (t.duration || '').split(':').map(Number)
      return sum + (p.length >= 2 ? p.reduce((a, b) => a * 60 + b, 0) : 0)
    }, 0) / 60
  )
  const btn = 'w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-white bg-black/40 sm:bg-transparent'

  return (
    <div className="pt-20 min-h-screen bg-obsidian pb-40">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <BackButton fallbackHref="/music/library?tab=playlists" className="inline-flex items-center gap-1.5 text-slate-400 hover:text-white text-sm mb-4">
          Volver
        </BackButton>

        <div className="flex flex-col sm:flex-row sm:items-end gap-5 mb-6">
          <PlaylistCover tracks={tracks} className="w-40 h-40 sm:w-48 sm:h-48 rounded-2xl shadow-2xl shadow-violet-900/40 shrink-0 mx-auto sm:mx-0" />
          <div className="min-w-0 flex-1">
            <p className="text-slate-500 text-xs font-bold uppercase tracking-[0.12em]">Playlist</p>
            {editing ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  rename(playlist.id, name)
                  setEditing(false)
                }}
                className="flex gap-2 mt-1"
              >
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={60}
                  aria-label="Nombre de la playlist"
                  className="min-w-0 flex-1 bg-surface-2 border border-white/10 text-white rounded-xl px-3 py-2 text-xl font-bold focus:outline-none focus:border-violet-500"
                />
                <button type="submit" className="w-11 h-11 rounded-full bg-violet-500 text-white flex items-center justify-center" aria-label="Guardar nombre">
                  <Check className="w-5 h-5" />
                </button>
                <button type="button" onClick={() => setEditing(false)} className="w-11 h-11 rounded-full bg-surface-2 text-slate-300 flex items-center justify-center" aria-label="Cancelar">
                  <X className="w-5 h-5" />
                </button>
              </form>
            ) : (
              <h1 className="text-3xl sm:text-4xl font-black text-white leading-tight break-words">{playlist.name}</h1>
            )}
            <p className="text-slate-400 text-sm mt-1">
              {tracks.length} {tracks.length === 1 ? 'canción' : 'canciones'}
              {minutes > 0 ? ` · ${minutes} min` : ''}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-4">
              <button onClick={() => play(0, false)} disabled={!tracks.length} className="inline-flex items-center gap-2 bg-violet-500 text-white font-bold px-5 py-2.5 rounded-full text-sm disabled:opacity-50">
                <Play className="w-4 h-4 fill-white" /> Reproducir
              </button>
              <button onClick={() => play(0, true)} disabled={!tracks.length} className="inline-flex items-center gap-2 bg-surface-1 border border-white/10 text-white font-semibold px-4 py-2.5 rounded-full text-sm disabled:opacity-50">
                <Shuffle className="w-4 h-4" /> Aleatorio
              </button>
              <button
                onClick={() => {
                  setName(playlist.name)
                  setEditing(true)
                }}
                className="w-10 h-10 rounded-full bg-surface-1 border border-white/10 text-slate-300 flex items-center justify-center"
                aria-label="Cambiar el nombre"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  if (!confirmDelete) return setConfirmDelete(true)
                  remove(playlist.id)
                  router.replace('/music/library?tab=playlists')
                }}
                className={`h-10 rounded-full border flex items-center justify-center gap-1.5 text-sm ${confirmDelete ? 'px-4 bg-red-500/20 border-red-400/40 text-red-300' : 'w-10 bg-surface-1 border-white/10 text-slate-300'}`}
                aria-label="Eliminar la playlist"
              >
                <Trash2 className="w-4 h-4" /> {confirmDelete && '¿Eliminar playlist?'}
              </button>
              <span className="ml-auto">
                <ViewToggle />
              </span>
            </div>
          </div>
        </div>

        {tracks.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-white/10 rounded-xl text-slate-500 text-sm">
            Aún no tiene canciones. En cualquier canción toca <b>⋮</b> o el botón de playlist y elige <b>{playlist.name}</b>.
          </div>
        ) : (
          <TrackTiles
            tracks={tracks}
            view={view}
            numbered
            onPlay={(i) => play(i)}
            actions={(t, i) => (
              <>
                <button onClick={() => moveTrack(playlist.id, i, i - 1)} disabled={i === 0} className={`${btn} disabled:opacity-30`} aria-label="Subir">
                  <ArrowUp className="w-4 h-4" />
                </button>
                <button onClick={() => moveTrack(playlist.id, i, i + 1)} disabled={i === tracks.length - 1} className={`${btn} disabled:opacity-30`} aria-label="Bajar">
                  <ArrowDown className="w-4 h-4" />
                </button>
                <button onClick={() => removeTrack(playlist.id, t.id)} className={`${btn} hover:text-red-400`} aria-label="Quitar de la playlist">
                  <X className="w-4 h-4" />
                </button>
              </>
            )}
          />
        )}
      </div>
    </div>
  )
}
