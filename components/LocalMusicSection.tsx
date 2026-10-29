'use client'

import { useShallow } from 'zustand/react/shallow'
import { useCallback, useEffect, useRef, useState } from 'react'
import { HardDriveDownload, Play, Shuffle, Trash2, Plus, Loader2, WifiOff } from 'lucide-react'
import { useMusicStore } from '@/store/musicStore'
import { addLocalFiles, listLocalTracks, removeLocalTrack, toTrack, type LocalTrackInfo } from '@/lib/local-music'

// "En este teléfono": música propia (archivos de audio) para escuchar sin conexión y con la
// pantalla bloqueada.
export default function LocalMusicSection() {
  const [tracks, setTracks] = useState<LocalTrackInfo[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [message, setMessage] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const { play, toggleShuffle } = useMusicStore(useShallow((s) => ({ play: s.play, toggleShuffle: s.toggleShuffle })))

  const refresh = useCallback(() => {
    listLocalTracks()
      .then(setTracks)
      .catch(() => setTracks([]))
  }, [])
  useEffect(refresh, [refresh])

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setAdding(true)
    setMessage('')
    try {
      const n = await addLocalFiles(files)
      setMessage(n > 0 ? `${n} ${n === 1 ? 'canción agregada' : 'canciones agregadas'}` : 'Esos archivos no son de música')
    } catch {
      setMessage('No hay espacio suficiente en el teléfono para guardar la música.')
    }
    setAdding(false)
    refresh()
    if (inputRef.current) inputRef.current.value = ''
  }

  const playAll = (index: number, shuffle = false) => {
    if (!tracks?.length) return
    const st = useMusicStore.getState()
    if (shuffle !== st.shuffle) toggleShuffle()
    play(tracks.map(toTrack), shuffle ? Math.floor(Math.random() * tracks.length) : index)
  }

  const totalMb = (tracks ?? []).reduce((sum, t) => sum + t.size, 0) / 1024 / 1024

  return (
    <section className="mb-10 rounded-2xl bg-surface-1/60 border border-white/8 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="flex items-center gap-2 text-white font-bold text-lg font-display">
            <HardDriveDownload className="w-5 h-5 text-emerald-400" /> En este teléfono
          </h2>
          <p className="flex items-center gap-1 text-slate-400 text-xs mt-0.5">
            <WifiOff className="w-3.5 h-3.5" /> Tu música: suena sin conexión y con la pantalla bloqueada
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!!tracks?.length && (
            <>
              <button onClick={() => playAll(0)} className="w-10 h-10 rounded-full bg-violet-500 text-white flex items-center justify-center" aria-label="Reproducir todo">
                <Play className="w-4 h-4 fill-white" />
              </button>
              <button onClick={() => playAll(0, true)} className="w-10 h-10 rounded-full bg-surface-2 border border-white/10 text-white flex items-center justify-center" aria-label="Aleatorio">
                <Shuffle className="w-4 h-4" />
              </button>
            </>
          )}
          <button
            onClick={() => inputRef.current?.click()}
            disabled={adding}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-emerald-500 text-white text-sm font-semibold disabled:opacity-60"
          >
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Agregar música
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="audio/*,.mp3,.m4a,.aac,.ogg,.opus,.wav,.flac"
            multiple
            hidden
            onChange={(e) => onFiles(e.target.files)}
          />
        </div>
      </div>

      {message && <p className="text-emerald-300 text-sm mb-2">{message}</p>}

      {tracks === null ? null : tracks.length === 0 ? (
        <p className="text-slate-500 text-sm">
          Toca «Agregar música» y elige canciones (MP3, M4A…) de tu teléfono. Quedan guardadas en la app.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-white/5">
            {tracks.map((t, i) => (
              <li key={t.id} className="flex items-center gap-3 py-2">
                <button onClick={() => playAll(i)} className="min-w-0 flex-1 text-left">
                  <p className="text-white text-sm font-semibold truncate">{t.title}</p>
                  <p className="text-slate-500 text-xs truncate">{t.artist}</p>
                </button>
                <button
                  onClick={async () => {
                    await removeLocalTrack(t.id)
                    refresh()
                  }}
                  className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-slate-500 hover:text-red-400"
                  aria-label={`Quitar ${t.title} del teléfono`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
          <p className="text-slate-600 text-xs mt-2">
            {tracks.length} {tracks.length === 1 ? 'canción' : 'canciones'} · {totalMb.toFixed(1)} MB
          </p>
        </>
      )}
    </section>
  )
}
