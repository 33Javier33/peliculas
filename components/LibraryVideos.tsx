'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Heart, Clock3, X, MonitorPlay } from 'lucide-react'
import { useVideoStore, type SavedVideo } from '@/store/videoStore'
import YoutubePlayer from '@/components/YoutubePlayer'

// Biblioteca → Videos: los videos con me gusta y los guardados para después, como video (no audio)
export default function LibraryVideos() {
  const liked = useVideoStore((s) => s.liked)
  const later = useVideoStore((s) => s.watchLater)
  const toggle = useVideoStore((s) => s.toggle)
  const [tab, setTab] = useState<'liked' | 'later'>('liked')
  const [open, setOpen] = useState<SavedVideo | null>(null)
  const list = tab === 'liked' ? liked : later

  return (
    <section className="mb-10">
      <div className="mb-4 flex gap-2">
        {(['liked', 'later'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${tab === t ? 'bg-violet-300 text-violet-950' : 'border border-white/10 bg-surface-2/60 text-slate-300 hover:text-white'}`}
          >
            {t === 'liked' ? <Heart className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
            {t === 'liked' ? `Me gusta (${liked.length})` : `Ver después (${later.length})`}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-white/10 py-16 text-center">
          <MonitorPlay className="h-10 w-10 text-slate-700" />
          <p className="text-sm text-slate-400">{tab === 'liked' ? 'Aún no tienes videos con me gusta.' : 'Aún no guardaste videos para después.'}</p>
          <p className="text-xs text-slate-600">Toca el corazón o el reloj en un video para guardarlo aquí.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-4">
          {list.map((v) => (
            <div key={v.id} className="group relative min-w-0">
              <button onClick={() => setOpen(v)} className="block w-full text-left">
                <div className="relative aspect-video overflow-hidden rounded-xl bg-surface-2">
                  <Image src={v.thumbnail || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`} alt="" fill sizes="(max-width: 640px) 50vw, 25vw" className="object-cover transition-transform duration-500 group-hover:scale-105" unoptimized />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity group-hover:bg-black/30 group-hover:opacity-100">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-black">▶</span>
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-white">{v.title}</p>
                <p className="truncate text-xs text-slate-500">{v.channelTitle}</p>
              </button>
              <button
                onClick={() => toggle(tab === 'liked' ? 'liked' : 'watchLater', v)}
                className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1.5 text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                aria-label={tab === 'liked' ? 'Quitar de me gusta' : 'Quitar de ver después'}
                title={tab === 'liked' ? 'Quitar de me gusta' : 'Quitar de ver después'}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {open && (
        <YoutubePlayer
          key={open.id}
          videoId={open.id}
          title={open.title}
          channelTitle={open.channelTitle}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  )
}
