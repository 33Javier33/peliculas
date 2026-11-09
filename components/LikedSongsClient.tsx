'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { Heart, Play, Shuffle, ArrowLeft } from 'lucide-react'
import BackButton from '@/components/BackButton'
import { useMusicStore } from '@/store/musicStore'
import { TrackStateOverlay } from '@/components/TrackState'

// Tus me gusta como un disco: reproducir, aleatorio, tocar una canción o quitarle el ♥
export default function LikedSongsClient() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const saved = useMusicStore((s) => s.saved)
  const list = useMemo(() => [...saved].sort((a, b) => b.savedAt - a.savedAt), [saved])
  const playAt = (i: number, shuffle = false) => {
    const st = useMusicStore.getState()
    if (shuffle !== st.shuffle) st.toggleShuffle()
    st.play(list, shuffle ? Math.floor(Math.random() * list.length) : i)
  }
  if (!mounted) return <div className="pt-20 min-h-screen bg-obsidian" />
  return (
    <div className="pt-20 min-h-screen bg-obsidian pb-32">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <BackButton fallbackHref="/music" className="inline-flex items-center gap-1.5 text-slate-500 hover:text-violet-400 text-xs font-medium">
          <ArrowLeft className="w-3.5 h-3.5" /> Volver
        </BackButton>
        <div className="mt-4 flex items-end gap-4">
          <span className="w-28 h-28 rounded-xl bg-gradient-to-br from-violet-600 to-cyan-300 flex items-center justify-center shrink-0 shadow-lg">
            <Heart className="w-12 h-12 text-white fill-white" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-violet-300">Playlist</p>
            <h1 className="text-3xl font-black text-white font-display">Tus me gusta</h1>
            <p className="text-slate-400 text-sm">{list.length} {list.length === 1 ? 'canción' : 'canciones'}</p>
          </div>
        </div>
        {list.length > 0 && (
          <div className="mt-5 flex items-center gap-2">
            <button onClick={() => playAt(0)} className="inline-flex items-center gap-2 bg-violet-500 text-white font-bold px-5 py-2.5 rounded-full text-sm">
              <Play className="w-4 h-4 fill-white" /> Reproducir
            </button>
            <button onClick={() => playAt(0, true)} className="inline-flex items-center gap-2 bg-surface-1 border border-white/10 text-white font-semibold px-4 py-2.5 rounded-full text-sm">
              <Shuffle className="w-4 h-4" /> Aleatorio
            </button>
          </div>
        )}
        {list.length === 0 ? (
          <p className="mt-10 text-slate-500 text-sm text-center">Toca el ♥ en cualquier canción para guardarla aquí.</p>
        ) : (
          <ul className="mt-5 divide-y divide-white/5 border border-white/5 rounded-xl overflow-hidden">
            {list.map((t, i) => (
              <li key={t.id} className="flex items-center gap-3 px-3 py-2 hover:bg-white/5">
                <button onClick={() => playAt(i)} className="flex items-center gap-3 min-w-0 flex-1 text-left">
                  <span className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-surface-2">
                    {t.thumbnail && <Image src={t.thumbnail} alt="" fill sizes="48px" className="object-cover" />}
                    <TrackStateOverlay id={t.id} size="sm" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-white text-sm font-semibold truncate">{t.title.replace(/^[^-–]+[-–]\s*/, '') || t.title}</span>
                    <span className="block text-slate-500 text-xs truncate">{t.artist || t.channelTitle}</span>
                  </span>
                </button>
                <button onClick={() => useMusicStore.getState().toggleSaved(t)} className="p-2 text-purple-400" aria-label="Quitar de Me gusta" title="Quitar de Me gusta">
                  <Heart className="w-4 h-4 fill-purple-400" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
