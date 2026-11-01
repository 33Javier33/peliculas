'use client'

import { useEffect, useState } from 'react'
import { Loader2, Radio, Pause, Play, AlertCircle } from 'lucide-react'
import { useMusicStore } from '@/store/musicStore'
import { fetchRadioTracks } from '@/lib/archive-radio-client'
import { classifyLibrary } from '@/lib/library-radio'

// Radio de Internet Archive: una radio por género que no se detiene, hecha solo con música de
// archive.org (cada tanda trae canciones de discos distintos; el reproductor pide más solo).
export const ARCHIVE_RADIO_GENRES = [
  { id: 'latina', label: 'Latina', icon: '💃', color: 'from-rose-500 to-orange-500' },
  { id: 'rock', label: 'Rock', icon: '🎸', color: 'from-red-600 to-rose-700' },
  { id: 'pop', label: 'Pop', icon: '🎤', color: 'from-pink-500 to-fuchsia-600' },
  { id: 'electronica', label: 'Electrónica', icon: '🎛️', color: 'from-cyan-500 to-blue-600' },
  { id: 'jazz', label: 'Jazz', icon: '🎷', color: 'from-amber-500 to-yellow-600' },
  { id: 'blues', label: 'Blues', icon: '🎺', color: 'from-blue-700 to-indigo-700' },
  { id: 'clasica', label: 'Clásica', icon: '🎻', color: 'from-stone-500 to-amber-700' },
  { id: 'hiphop', label: 'Hip hop', icon: '🎧', color: 'from-violet-600 to-purple-800' },
  { id: 'reggae', label: 'Reggae y ska', icon: '🌴', color: 'from-green-600 to-yellow-500' },
  { id: 'folk', label: 'Folk y country', icon: '🪕', color: 'from-orange-700 to-amber-800' },
  { id: 'metal', label: 'Metal', icon: '🤘', color: 'from-zinc-600 to-zinc-900' },
  { id: 'ambient', label: 'Relajo', icon: '🌙', color: 'from-indigo-500 to-sky-700' },
  { id: 'antiguos', label: 'Discos de 78 rpm', icon: '📻', color: 'from-yellow-700 to-stone-700' },
  { id: 'envivo', label: 'Conciertos en vivo', icon: '🏟️', color: 'from-emerald-600 to-teal-700' },
]

export default function ArchiveRadioSection({ className = '' }: { className?: string }) {
  const current = useMusicStore((s) => s.queue[s.currentIndex]?.archiveRadio)
  const isPlaying = useMusicStore((s) => s.isPlaying)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Se van conociendo los géneros de tu biblioteca: así las radios suman tus canciones guardadas
  useEffect(() => {
    const t = setTimeout(() => classifyLibrary().catch(() => {}), 1500)
    return () => clearTimeout(t)
  }, [])

  const start = async (id: string) => {
    const st = useMusicStore.getState()
    // La misma radio: pausar o seguir
    if (current === id) return st.togglePlay()
    setLoading(id)
    setError(null)
    try {
      const tracks = await fetchRadioTracks(id)
      if (!tracks.length) throw new Error()
      if (st.shuffle) st.toggleShuffle()
      st.play(tracks, 0)
    } catch {
      setError(id)
    } finally {
      setLoading(null)
    }
  }

  return (
    <section className={className}>
      <div className="flex items-center gap-2 mb-1">
        <Radio className="w-5 h-5 text-violet-300" />
        <h2 className="text-white font-bold text-lg font-display">Radios de Internet Archive</h2>
      </div>
      <p className="text-slate-400 text-xs mb-3">Música sin parar por género con discos de archive.org, mezclada con las canciones de tu biblioteca de ese género. Nunca se termina.</p>
      <div className="grid grid-rows-2 grid-flow-col auto-cols-[42%] sm:auto-cols-[22%] lg:auto-cols-[13.5%] gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x [scrollbar-width:none]">
        {ARCHIVE_RADIO_GENRES.map((g) => {
          const on = current === g.id
          return (
            <button
              key={g.id}
              onClick={() => start(g.id)}
              disabled={!!loading}
              aria-label={`Radio ${g.label}`}
              className={`relative h-20 snap-start rounded-2xl bg-gradient-to-br ${g.color} p-3 text-left overflow-hidden transition-transform active:scale-95 ${
                on ? 'ring-2 ring-white shadow-glow' : ''
              }`}
            >
              <span className="absolute -right-1 -bottom-2 text-4xl opacity-80 select-none">{g.icon}</span>
              <span className="relative block text-white font-bold text-sm leading-tight drop-shadow">{g.label}</span>
              <span className="relative mt-1 flex items-center gap-1 text-[11px] text-white/85">
                {loading === g.id ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" /> Sintonizando…
                  </>
                ) : on ? (
                  isPlaying ? (
                    <>
                      <span className="flex items-end gap-px h-3">
                        <span className="w-0.5 h-2 bg-white animate-pulse" />
                        <span className="w-0.5 h-3 bg-white animate-pulse [animation-delay:150ms]" />
                        <span className="w-0.5 h-1.5 bg-white animate-pulse [animation-delay:300ms]" />
                      </span>
                      Al aire · <Pause className="w-3 h-3" />
                    </>
                  ) : (
                    <>
                      <Play className="w-3 h-3" /> En pausa
                    </>
                  )
                ) : error === g.id ? (
                  <>
                    <AlertCircle className="w-3 h-3" /> Reintentar
                  </>
                ) : (
                  'Escuchar'
                )}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
