'use client'

import { ListMusic } from 'lucide-react'
import type { MusicVideo } from '@/lib/youtube-music'

/** Portada de una playlist: las carátulas de sus primeras canciones en mosaico (como Spotify) */
export default function PlaylistCover({ tracks, className = '' }: { tracks: MusicVideo[]; className?: string }) {
  const covers = Array.from(new Set(tracks.map((t) => t.thumbnail).filter((u) => u && !u.startsWith('/icons/')))).slice(0, 4)
  return (
    <span className={`relative block overflow-hidden bg-gradient-to-br from-violet-600/40 to-fuchsia-600/30 ${className}`}>
      {covers.length >= 4 ? (
        <span className="grid grid-cols-2 grid-rows-2 w-full h-full">
          {covers.map((c) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={c} src={c} alt="" loading="lazy" className="w-full h-full object-cover" />
          ))}
        </span>
      ) : covers.length > 0 ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={covers[0]} alt="" loading="lazy" className="w-full h-full object-cover" />
      ) : (
        <span className="w-full h-full flex items-center justify-center">
          <ListMusic className="w-1/3 h-1/3 text-white/70" />
        </span>
      )}
    </span>
  )
}
