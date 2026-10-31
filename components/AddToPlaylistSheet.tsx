'use client'

import { useEffect, useState } from 'react'
import { Plus, X, Check } from 'lucide-react'
import { usePlaylistStore } from '@/store/playlistStore'
import PlaylistCover from '@/components/PlaylistCover'

// Ventana "Agregar a playlist": se abre desde cualquier canción (usePlaylistStore.openAdd)
export default function AddToPlaylistSheet() {
  const pending = usePlaylistStore((s) => s.pending)
  const playlists = usePlaylistStore((s) => s.playlists)
  const { closeAdd, create, addTracks } = usePlaylistStore.getState()
  const [name, setName] = useState('')
  const [done, setDone] = useState<string | null>(null)

  useEffect(() => {
    if (pending) {
      setName('')
      setDone(null)
    }
  }, [pending])
  useEffect(() => {
    if (!done) return
    const t = setTimeout(closeAdd, 900)
    return () => clearTimeout(t)
  }, [done, closeAdd])

  if (!pending) return null
  const what = pending.length === 1 ? pending[0].title.replace(/^[^-–]+[-–]\s*/, '') || pending[0].title : `${pending.length} canciones`

  const addTo = (id: string, plName: string) => {
    const n = addTracks(id, pending)
    setDone(n ? `Agregada${pending.length > 1 ? 's' : ''} a "${plName}"` : `Ya estaba en "${plName}"`)
  }
  const createNew = (e: React.FormEvent) => {
    e.preventDefault()
    const plName = name.trim() || `Mi playlist ${playlists.length + 1}`
    create(plName, pending)
    setDone(`Playlist "${plName}" creada`)
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Agregar a playlist">
      <button className="absolute inset-0 bg-black/60" onClick={closeAdd} aria-label="Cerrar" />
      <div className="relative w-full max-w-md max-h-[80vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-surface-1 border border-white/10 pb-[max(16px,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-white/8">
          <div className="min-w-0 flex-1">
            <p className="text-white font-bold font-display">Agregar a playlist</p>
            <p className="text-slate-400 text-xs truncate">{what}</p>
          </div>
          <button onClick={closeAdd} className="w-9 h-9 rounded-full bg-surface-2 flex items-center justify-center text-slate-300" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>

        {done ? (
          <p className="flex items-center justify-center gap-2 py-10 text-emerald-300 font-semibold">
            <Check className="w-5 h-5" /> {done}
          </p>
        ) : (
          <>
            <form onSubmit={createNew} className="flex gap-2 px-5 py-3">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre de una playlist nueva"
                aria-label="Nombre de la playlist nueva"
                maxLength={60}
                className="min-w-0 flex-1 bg-surface-2 border border-white/10 text-white placeholder-slate-500 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:border-violet-500"
              />
              <button type="submit" className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-violet-500 text-white text-sm font-semibold">
                <Plus className="w-4 h-4" /> Crear
              </button>
            </form>
            <ul className="overflow-y-auto overscroll-contain px-2 pb-2">
              {playlists.map((p) => (
                <li key={p.id}>
                  <button onClick={() => addTo(p.id, p.name)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-white/5">
                    <PlaylistCover tracks={p.tracks} className="w-12 h-12 rounded-lg shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-white text-sm font-semibold truncate">{p.name}</span>
                      <span className="block text-slate-500 text-xs">
                        {p.tracks.length} {p.tracks.length === 1 ? 'canción' : 'canciones'}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
              {playlists.length === 0 && <li className="px-3 py-4 text-slate-500 text-sm">Aún no tienes playlists: escribe un nombre y toca Crear.</li>}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
