'use client'

import Image from 'next/image'
import { Play, Plus, Eye, Heart, Music, ListPlus } from 'lucide-react'
import { usePlaylistStore } from '@/store/playlistStore'
import { useMusicStore } from '@/store/musicStore'
import { TrackStateOverlay } from '@/components/TrackState'
import type { MusicVideo } from '@/lib/youtube-music'

interface MusicCardProps {
  video: MusicVideo
  allVideos: MusicVideo[]
  index: number
  /** Mosaico (tarjeta) o fila de lista */
  view?: 'list' | 'grid'
}

export default function MusicCard({ video, allVideos, index, view = 'grid' }: MusicCardProps) {
  // Solo lo que usa la tarjeta (así no se redibuja cada vez que avanza la canción)
  const play = useMusicStore((s) => s.play)
  const addToQueue = useMusicStore((s) => s.addToQueue)
  const toggleSaved = useMusicStore((s) => s.toggleSaved)
  const isSaved = useMusicStore((s) => s.saved.some((t) => t.id === video.id))
  const isCurrent = useMusicStore((s) => s.isVisible && s.queue[s.currentIndex]?.id === video.id)
  const openAdd = usePlaylistStore((s) => s.openAdd)

  if (view === 'list')
    return (
      <div
        onClick={() => play(allVideos, index)}
        className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-white/5 active:bg-white/10 ${isCurrent ? 'bg-emerald-500/5' : ''}`}
      >
        <span className="relative w-20 aspect-video rounded-lg overflow-hidden shrink-0 bg-surface-2">
          {video.thumbnail && <Image src={video.thumbnail} alt="" fill sizes="80px" className="object-cover" />}
          <TrackStateOverlay id={video.id} size="sm" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-sm font-medium line-clamp-2 ${isCurrent ? 'text-emerald-400' : 'text-white'}`}>{video.title}</span>
          <span className="block text-slate-500 text-xs truncate">
            {video.channelTitle}
            {video.duration ? ` · ${video.duration}` : ''}
          </span>
        </span>
        <span className="flex items-center shrink-0" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => openAdd([video])} className="p-2 text-slate-500 hover:text-violet-400" aria-label="Agregar a playlist" title="Agregar a playlist">
            <ListPlus className="w-4 h-4" />
          </button>
          <button onClick={() => toggleSaved(video)} className={`p-2 ${isSaved ? 'text-purple-400' : 'text-slate-500 hover:text-purple-400'}`} aria-pressed={isSaved} aria-label={isSaved ? 'Quitar de guardadas' : 'Guardar canción'}>
            <Heart className={`w-4 h-4 ${isSaved ? 'fill-purple-400' : ''}`} />
          </button>
        </span>
      </div>
    )

  return (
    <div className="group relative bg-surface-1 border border-white/8 rounded-xl overflow-hidden hover:border-violet-500/30 hover:bg-surface-1 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-violet-900/20">
      {/* Thumbnail */}
      <div
        className="relative aspect-video cursor-pointer overflow-hidden"
        onClick={() => play(allVideos, index)}
      >
        {video.thumbnail ? (
          <Image
            src={video.thumbnail}
            alt={video.title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-surface-2 flex items-center justify-center">
            <Music className="w-10 h-10 text-slate-700" />
          </div>
        )}

        <TrackStateOverlay id={video.id} />

        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
          <div className="bg-white rounded-full p-3 shadow-2xl shadow-violet-900/40 transform scale-75 group-hover:scale-100 transition-transform duration-300">
            <Play className="w-5 h-5 text-black fill-black ml-0.5" />
          </div>
        </div>

        {video.duration && (
          <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs font-mono px-1.5 py-0.5 rounded">
            {video.duration}
          </div>
        )}

        {/* Top-right action buttons */}
        <div className="absolute top-2 right-2 flex items-center gap-1.5">
          <button
            onClick={(e) => {
              e.stopPropagation()
              toggleSaved(video)
            }}
            className={`p-1.5 rounded-full transition-all duration-200 hover:scale-110 ${
              isSaved
                ? 'bg-purple-600/90 text-white opacity-100'
                : 'bg-black/70 text-white opacity-0 group-hover:opacity-100 hover:bg-purple-600'
            }`}
            title={isSaved ? 'Quitar de guardadas' : 'Guardar canción'}
            aria-pressed={isSaved}
          >
            <Heart className={`w-3.5 h-3.5 ${isSaved ? 'fill-white' : ''}`} />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation()
              openAdd([video])
            }}
            className="p-1.5 bg-black/70 text-white rounded-full sm:opacity-0 sm:group-hover:opacity-100 hover:bg-violet-600 transition-all duration-200 hover:scale-110"
            title="Agregar a playlist"
            aria-label="Agregar a playlist"
          >
            <ListPlus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              addToQueue(video)
            }}
            className="p-1.5 bg-black/70 text-white rounded-full opacity-0 group-hover:opacity-100 hover:bg-violet-600 transition-all duration-200 hover:scale-110"
            title="Añadir a la cola"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="p-3">
        <h3
          className="text-white text-xs sm:text-sm font-medium leading-snug line-clamp-2 cursor-pointer hover:text-violet-400 transition-colors duration-200 mb-2"
          onClick={() => play(allVideos, index)}
        >
          {video.title}
        </h3>

        <div className="flex items-center justify-between gap-2">
          <p className="text-slate-500 text-xs truncate flex-1">{video.channelTitle}</p>

          <div className="flex items-center gap-2 shrink-0">
            {video.viewCount && (
              <span className="text-slate-700 text-xs flex items-center gap-0.5 hidden sm:flex">
                <Eye className="w-2.5 h-2.5" />
                {video.viewCount}
              </span>
            )}
            {video.likeCount && (
              <span className="text-slate-700 text-xs flex items-center gap-0.5 hidden lg:flex">
                <Heart className="w-2.5 h-2.5" />
                {video.likeCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
