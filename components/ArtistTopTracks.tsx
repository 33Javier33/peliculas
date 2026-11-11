'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { Play, Loader2, Shuffle } from 'lucide-react'
import { useMusicStore } from '@/store/musicStore'
import { cachedJson } from '@/lib/client-cache'

// Los temas más escuchados del artista (ordenados por reproducciones)
interface Top { id: string; title: string; channel: string; thumbnail: string; views: number }

const compact = (n: number) => new Intl.NumberFormat('es', { notation: 'compact', maximumFractionDigits: 1 }).format(n)

export default function ArtistTopTracks({ name }: { name: string }) {
  const [tracks, setTracks] = useState<Top[] | null>(null)
  useEffect(() => {
    let alive = true
    cachedJson<{ tracks?: Top[] }>(`/api/artist-top?name=${encodeURIComponent(name)}`, 12 * 3600_000, (d) => !!d?.tracks?.length)
      .then((d) => alive && setTracks(d?.tracks ?? []))
      .catch(() => alive && setTracks([]))
    return () => {
      alive = false
    }
  }, [name])

  if (tracks === null)
    return (
      <div className="mt-10 flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Buscando sus temas más escuchados…
      </div>
    )
  if (!tracks.length) return null

  const play = (i: number, shuffle = false) => {
    const list = tracks.map((t) => ({ id: t.id, title: t.title, channelTitle: t.channel, thumbnail: t.thumbnail, publishedAt: '', description: '' }))
    const st = useMusicStore.getState()
    if (st.shuffle !== shuffle) st.toggleShuffle()
    st.play(list as never, i)
    st.setIsPlaying(true)
  }

  return (
    <section className="mt-10">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-[22px] font-bold leading-7 text-white">Los más escuchados</h2>
        <div className="ml-auto flex gap-2">
          <button onClick={() => play(0)} className="inline-flex items-center gap-2 rounded-full bg-violet-300 px-5 py-2 text-sm font-bold text-violet-950 hover:bg-violet-200">
            <Play className="h-4 w-4 fill-violet-950" /> Reproducir
          </button>
          <button onClick={() => play(Math.floor(Math.random() * tracks.length), true)} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-surface-2/70 px-4 py-2 text-sm font-semibold text-slate-200 hover:text-white">
            <Shuffle className="h-4 w-4" /> Aleatorio
          </button>
        </div>
      </div>
      <ol className="flex flex-col">
        {tracks.map((t, i) => (
          <li key={t.id}>
            <button onClick={() => play(i)} className="group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/5">
              <span className="w-5 text-center text-sm font-bold text-slate-500 tabular-nums">{i + 1}</span>
              <div className="relative h-11 w-16 shrink-0 overflow-hidden rounded-md bg-surface-2">
                <Image src={t.thumbnail} alt="" fill sizes="64px" className="object-cover" unoptimized />
                <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity group-hover:bg-black/40 group-hover:opacity-100">
                  <Play className="h-4 w-4 fill-white text-white" />
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{t.title}</p>
                <p className="truncate text-xs text-slate-500">{t.views ? `${compact(t.views)} reproducciones` : t.channel}</p>
              </div>
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}
