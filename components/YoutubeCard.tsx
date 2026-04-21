'use client'

import Image from 'next/image'
import { Play, Clock, Eye } from 'lucide-react'
import type { YouTubeSearchItem } from '@/lib/youtube'
import { getBestThumbnail, timeAgo } from '@/lib/youtube'

interface YoutubeCardProps {
  item: YouTubeSearchItem
  duration?: string
  viewCount?: string
  onClick: (videoId: string, title: string, channelTitle: string) => void
}

export default function YoutubeCard({ item, duration, viewCount, onClick }: YoutubeCardProps) {
  const thumbnail = getBestThumbnail(item)
  const { title, channelTitle, publishedAt, description } = item.snippet
  const videoId = item.id.videoId

  return (
    <button
      onClick={() => onClick(videoId, title, channelTitle)}
      className="group w-full text-left bg-[#111111] border border-white/10 rounded-xl overflow-hidden hover:border-red-500/50 hover:shadow-xl hover:shadow-red-900/20 transition-all duration-300 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-red-500/50"
    >
      <div className="relative aspect-video overflow-hidden bg-[#1a1a1a]">
        {thumbnail ? (
          <Image
            src={thumbnail}
            alt={title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-[#1a1a1a]">
            <Play className="w-10 h-10 text-slate-700" />
          </div>
        )}

        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors duration-300" />

        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="bg-red-600 rounded-full p-4 shadow-2xl shadow-red-900/60 transform scale-75 group-hover:scale-100 transition-transform duration-300">
            <Play className="w-6 h-6 text-white fill-white" />
          </div>
        </div>

        {duration && (
          <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/80 text-white text-xs font-mono font-medium px-2 py-0.5 rounded">
            <Clock className="w-2.5 h-2.5" />
            {duration}
          </div>
        )}
      </div>

      <div className="p-3">
        <h3 className="text-white font-semibold text-sm leading-snug line-clamp-2 group-hover:text-red-400 transition-colors duration-200 mb-1.5">
          {title}
        </h3>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-slate-500 text-xs font-medium truncate max-w-[140px]">
            {channelTitle}
          </span>
          {viewCount && (
            <>
              <span className="w-0.5 h-0.5 bg-slate-700 rounded-full" />
              <span className="text-slate-600 text-xs flex items-center gap-1">
                <Eye className="w-3 h-3" />
                {viewCount}
              </span>
            </>
          )}
          <span className="w-0.5 h-0.5 bg-slate-700 rounded-full" />
          <span className="text-slate-600 text-xs">{timeAgo(publishedAt)}</span>
        </div>

        {description && (
          <p className="text-slate-600 text-xs mt-2 line-clamp-2 leading-relaxed">
            {description}
          </p>
        )}
      </div>
    </button>
  )
}
