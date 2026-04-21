'use client'

import { useEffect, useCallback } from 'react'
import { X, ExternalLink, TvMinimalPlay } from 'lucide-react'

interface YoutubePlayerProps {
  videoId: string
  title: string
  channelTitle: string
  onClose: () => void
}

export default function YoutubePlayer({
  videoId,
  title,
  channelTitle,
  onClose,
}: YoutubePlayerProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [handleKeyDown])

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 bg-[#0a0a0a] border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-7 h-7 bg-red-600 rounded-lg flex items-center justify-center shrink-0">
            <TvMinimalPlay className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-white font-semibold text-sm leading-tight truncate max-w-[60vw] sm:max-w-[70vw]">
              {title}
            </p>
            <p className="text-slate-400 text-xs truncate">{channelTitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-3">
          <a
            href={`https://www.youtube.com/watch?v=${videoId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-all duration-200"
            title="Abrir en YouTube"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-all duration-200"
            title="Cerrar (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-2 sm:p-4 min-h-0">
        <div className="w-full max-w-6xl">
          <div className="relative w-full aspect-video rounded-xl overflow-hidden shadow-2xl shadow-black bg-black">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&color=white&hl=es&cc_lang_pref=es`}
              title={title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="absolute inset-0 w-full h-full"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
