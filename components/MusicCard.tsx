'use client'

import Image from 'next/image'
import { Play, Plus, Eye, Heart, Music } from 'lucide-react'
import { useMusicStore } from '@/store/musicStore'
import type { MusicVideo } from '@/lib/youtube-music'

interface MusicCardProps {
  video: MusicVideo
  allVideos: MusicVideo[]
  index: number
}

export default function MusicCard({ video, allVideos, index }: MusicCardProps) {
  const { play, addToQueue } = useMusicStore()

  return (
    <div className="group relative bg-[#0d0d0d] border border-white/8 rounded-xl overflow-hidden hover:border-purple-500/30 hover:bg-[#111111] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-purple-900/20">
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
          <div className="w-full h-full bg-[#1a1a1a] flex items-center justify-center">
            <Music className="w-10 h-10 text-slate-700" />
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
          <div className="bg-white rounded-full p-3 shadow-2xl shadow-purple-900/40 transform scale-75 group-hover:scale-100 transition-transform duration-300">
            <Play className="w-5 h-5 text-black fill-black ml-0.5" />
          </div>
        </div>

        {video.duration && (
          <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs font-mono px-1.5 py-0.5 rounded">
            {video.duration}
          </div>
        )}

        {/* Add to queue button (top right on hover) */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            addToQueue(video)
          }}
          className="absolute top-2 right-2 p-1.5 bg-black/70 text-white rounded-full opacity-0 group-hover:opacity-100 hover:bg-purple-600 transition-all duration-200 hover:scale-110"
          title="Añadir a la cola"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Info */}
      <div className="p-3">
        <h3
          className="text-white text-xs sm:text-sm font-medium leading-snug line-clamp-2 cursor-pointer hover:text-purple-400 transition-colors duration-200 mb-2"
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
