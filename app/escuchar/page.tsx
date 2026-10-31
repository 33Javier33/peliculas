'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import SharedTrackClient from '@/components/SharedTrackClient'
import { readSharedTrack } from '@/lib/share'
import type { MusicVideo } from '@/lib/youtube-music'

// Canción compartida de un disco o enlace (archive.org, MP3): viene completa después del #
export default function SharedLinkTrackPage() {
  const [video, setVideo] = useState<MusicVideo | null | undefined>(undefined)
  useEffect(() => {
    readSharedTrack(window.location.hash.slice(1)).then(setVideo)
  }, [])
  if (video === undefined)
    return (
      <div className="pt-32 min-h-screen flex justify-center">
        <Loader2 className="w-8 h-8 text-violet-300 animate-spin" />
      </div>
    )
  if (!video)
    return (
      <div className="pt-32 min-h-screen text-center px-4">
        <p className="text-slate-300">Este enlace de canción no está completo.</p>
        <Link href="/music" className="inline-block mt-4 text-violet-300 underline">
          Ir a Música
        </Link>
      </div>
    )
  return <SharedTrackClient video={video} />
}
