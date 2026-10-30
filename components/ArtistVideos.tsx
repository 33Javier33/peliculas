'use client'

import { useEffect, useState } from 'react'
import { PlayCircle } from 'lucide-react'
import YoutubePlayer from '@/components/YoutubePlayer'
import { decodeEntities } from '@/lib/youtube-music'
import type { YouTubeSearchItem } from '@/lib/youtube'

// Videos de YouTube del artista o grupo (videoclips, en vivo, entrevistas). Se ven en el
// reproductor de videos (la música se pausa y luego sigue).
export default function ArtistVideos({ name }: { name: string }) {
  const [items, setItems] = useState<YouTubeSearchItem[] | null>(null)
  const [open, setOpen] = useState<{ id: string; title: string; channel: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/youtube/search?lang=todo&q=${encodeURIComponent(`${name} video oficial`)}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d: { items?: YouTubeSearchItem[] }) => !cancelled && setItems(d.items ?? []))
      .catch(() => !cancelled && setItems([]))
    return () => {
      cancelled = true
    }
  }, [name])

  if (!items || items.length === 0) return null
  return (
    <section className="mb-10">
      <h2 className="text-white font-bold text-[22px] leading-7 mb-4">Videos</h2>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">
        {items.slice(0, 16).map((v) => {
          const id = v.id.videoId
          const title = decodeEntities(v.snippet.title)
          return (
            <button key={id} onClick={() => setOpen({ id, title, channel: v.snippet.channelTitle })} className="shrink-0 w-64 text-left group">
              <div className="relative aspect-video rounded-xl overflow-hidden bg-surface-2 border border-white/8">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                <span className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <PlayCircle className="w-10 h-10 text-white/90 drop-shadow" />
                </span>
              </div>
              <p className="text-white text-sm font-semibold leading-snug line-clamp-2 mt-1.5">{title}</p>
              <p className="text-slate-500 text-xs truncate">{v.snippet.channelTitle}</p>
            </button>
          )
        })}
      </div>
      {open && <YoutubePlayer videoId={open.id} title={open.title} channelTitle={open.channel} onClose={() => setOpen(null)} />}
    </section>
  )
}
