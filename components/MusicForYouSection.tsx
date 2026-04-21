'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Music2, Play, Sparkles, Heart, ChevronRight, User } from 'lucide-react'
import { useMusicStore } from '@/store/musicStore'

export default function MusicForYouSection() {
  const { history, saved, play, playSaved } = useMusicStore()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const recent = useMemo(() => history.slice(0, 10), [history])
  const topArtists = useMemo(() => {
    const counter = new Map<string, { plays: number; cover: string }>()
    for (const h of history) {
      const a = h.artist || h.channelTitle
      if (!a) continue
      const prev = counter.get(a)
      counter.set(a, { plays: (prev?.plays ?? 0) + (h.plays || 1), cover: prev?.cover ?? h.thumbnail })
    }
    return Array.from(counter.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.plays - a.plays)
      .slice(0, 6)
  }, [history])

  if (!mounted) return null
  if (history.length === 0 && saved.length === 0) return null

  return (
    <section className="relative">
      <div className="absolute -inset-x-4 sm:-inset-x-8 lg:-inset-x-12 -top-4 bottom-0 bg-gradient-to-b from-purple-900/10 via-transparent to-transparent rounded-3xl pointer-events-none" />

      <div className="relative">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-1 h-8 bg-gradient-to-b from-purple-500 to-pink-500 rounded-full" />
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-400" />
              Tu música
            </h2>
            <span className="text-slate-500 text-sm font-normal">basado en lo que escuchas</span>
          </div>
          <Link
            href="/music"
            className="inline-flex items-center gap-1 text-purple-400 hover:text-purple-300 text-sm font-medium transition-colors"
          >
            Ir a Music Station <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Top artists row */}
        {topArtists.length > 0 && (
          <div className="mb-8">
            <h3 className="text-slate-400 text-xs uppercase tracking-wider font-bold mb-3">
              Artistas que escuchas
            </h3>
            <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1 scroll-smooth">
              {topArtists.map((a) => (
                <Link
                  key={a.name}
                  href="/music/library"
                  className="group shrink-0 w-28 text-center"
                >
                  <div className="relative w-24 h-24 mx-auto rounded-full overflow-hidden bg-[#1a1a1a] border border-white/5 group-hover:border-purple-500/40 transition-all shadow-lg">
                    {a.cover ? (
                      <Image
                        src={a.cover}
                        alt={a.name}
                        fill
                        sizes="96px"
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <User className="w-8 h-8 text-slate-700" />
                      </div>
                    )}
                  </div>
                  <p className="text-white text-xs font-semibold mt-2 truncate">{a.name}</p>
                  <p className="text-slate-600 text-[10px] mt-0.5">
                    {a.plays} {a.plays === 1 ? 'reproducción' : 'reproducciones'}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Recent tracks */}
        {recent.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-slate-400 text-xs uppercase tracking-wider font-bold">
                Escuchado recientemente
              </h3>
              {recent.length > 1 && (
                <button
                  onClick={() => play(recent, 0)}
                  className="inline-flex items-center gap-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-3 py-1.5 rounded-full transition-colors"
                >
                  <Play className="w-3 h-3 fill-white" /> Reproducir
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {recent.slice(0, 6).map((track, idx) => (
                <button
                  key={track.id}
                  onClick={() => play(recent, idx)}
                  className="group flex items-center gap-3 bg-[#0d0d0d] hover:bg-[#141414] border border-white/5 hover:border-purple-500/30 rounded-lg p-2 text-left transition-all"
                >
                  <div className="relative w-12 h-12 rounded-md overflow-hidden shrink-0 bg-[#1a1a1a]">
                    {track.thumbnail && (
                      <Image src={track.thumbnail} alt={track.title} fill sizes="48px" className="object-cover" />
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/60 flex items-center justify-center transition-colors">
                      <Play className="w-4 h-4 text-white fill-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-white text-sm font-medium truncate">{track.title}</p>
                    <p className="text-slate-500 text-xs truncate">
                      {track.artist || track.channelTitle}
                    </p>
                  </div>
                  {track.plays > 1 && (
                    <span className="text-purple-400 text-[10px] font-bold bg-purple-500/10 px-2 py-0.5 rounded-full shrink-0">
                      ×{track.plays}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Saved shortcut */}
        {saved.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 mt-4">
            <button
              onClick={() => playSaved(0)}
              className="inline-flex items-center gap-2 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white font-bold px-4 py-2 rounded-full text-sm transition-all hover:scale-105 shadow-lg shadow-purple-900/30"
            >
              <Heart className="w-4 h-4 fill-white" /> Mis guardadas ({saved.length})
            </button>
            <Link
              href="/music/library"
              className="inline-flex items-center gap-1.5 text-slate-400 hover:text-white text-sm font-medium transition-colors px-3 py-2 rounded-full border border-white/10 hover:border-purple-500/40"
            >
              <Music2 className="w-4 h-4" /> Ver biblioteca
            </Link>
          </div>
        )}
      </div>
    </section>
  )
}
