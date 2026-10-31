'use client'

import { useShallow } from 'zustand/react/shallow'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Play, Plus, Music2, ListPlus } from 'lucide-react'
import { usePlaylistStore } from '@/store/playlistStore'
import { useMusicStore, parseTrackMeta } from '@/store/musicStore'
import type { MusicVideo } from '@/lib/youtube-music'

/** Página de una canción compartida: se reproduce dentro de la app. */
export default function SharedTrackClient({ video }: { video: MusicVideo }) {
  const router = useRouter()
  const { play, addToQueue, requestFullPlayer, isVisible } = useMusicStore(
    useShallow((s) => ({
      play: s.play,
      addToQueue: s.addToQueue,
      requestFullPlayer: s.requestFullPlayer,
      isVisible: s.isVisible,
    }))
  )
  const parsed = parseTrackMeta(video).artist
  const artist = parsed && parsed !== 'Desconocido' ? parsed : video.channelTitle
  const songTitle = video.title.replace(/^[^-–]+[-–]\s*/, '') || video.title

  const handlePlay = () => {
    play([video], 0)
    requestFullPlayer(true)
    router.replace('/music')
  }

  return (
    <div className="relative min-h-screen pt-20 pb-32 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <Image src={video.thumbnail} alt="" fill sizes="100vw" className="object-cover scale-150 blur-3xl opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-b from-obsidian/40 via-obsidian/80 to-obsidian" />
      </div>

      <div className="relative max-w-md mx-auto px-5 pt-6 text-center">
        <p className="inline-flex items-center gap-2 text-emerald-400 text-[11px] font-bold uppercase tracking-[0.08em] font-display">
          <span className="w-2 h-2 rounded-full bg-emerald-400" /> Te compartieron una canción
        </p>

        <div className="relative w-full max-w-[min(100%,44vh)] mx-auto aspect-square rounded-2xl overflow-hidden bg-surface-2 border border-white/10 shadow-[0_20px_60px_rgba(139,92,246,0.35)] mt-5">
          <Image src={video.thumbnail} alt={video.title} fill sizes="(max-width: 448px) 90vw, 400px" className="object-cover" priority />
        </div>

        <h1 className="text-white text-[28px] leading-[34px] font-extrabold mt-6">{songTitle}</h1>
        {artist && <p className="text-slate-400 text-base mt-1">{artist}</p>}

        <button
          onClick={handlePlay}
          className="mt-8 w-full inline-flex items-center justify-center gap-2 bg-violet-300 hover:bg-violet-200 text-violet-950 font-extrabold font-display text-lg py-4 rounded-full shadow-[0_8px_32px_rgba(139,92,246,0.55)] transition-colors"
        >
          <Play className="w-6 h-6 fill-violet-950" /> Reproducir aquí
        </button>

        {isVisible && (
          <button
            onClick={() => addToQueue(video)}
            className="mt-3 w-full inline-flex items-center justify-center gap-2 bg-surface-1/80 border border-white/8 text-slate-200 font-semibold font-display py-3.5 rounded-full"
          >
            <Plus className="w-5 h-5" /> Añadir a mi cola
          </button>
        )}

        <button
          onClick={() => usePlaylistStore.getState().openAdd([video])}
          className="mt-3 w-full inline-flex items-center justify-center gap-2 bg-surface-1/80 border border-white/8 text-slate-200 font-semibold font-display py-3.5 rounded-full"
        >
          <ListPlus className="w-5 h-5" /> Agregar a mis playlists
        </button>

        <Link
          href="/music"
          className="mt-6 inline-flex items-center gap-2 text-violet-300 text-sm font-semibold"
        >
          <Music2 className="w-4 h-4" /> Explorar más música en la app
        </Link>
      </div>
    </div>
  )
}
