'use client'

import { useState, useCallback, useTransition, useRef } from 'react'
import Link from 'next/link'
import { Search, X, Loader2, AlertCircle, Music2, TrendingUp, Library } from 'lucide-react'
import MusicCard from '@/components/MusicCard'
import { useMusicStore } from '@/store/musicStore'
import type { MusicVideo } from '@/lib/youtube-music'

interface MusicSearchClientProps {
  initialVideos: MusicVideo[]
}

export default function MusicSearchClient({ initialVideos }: MusicSearchClientProps) {
  const savedCount = useMusicStore((s) => s.saved.length)
  const [query, setQuery] = useState('')
  const [videos, setVideos] = useState<MusicVideo[]>(initialVideos)
  const [nextPageToken, setNextPageToken] = useState<string | undefined>()
  const [isSearchMode, setIsSearchMode] = useState(false)
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSearch = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      const q = query.trim()
      if (!q) return

      setError(null)
      setSubmittedQuery(q)

      startTransition(async () => {
        try {
          const res = await fetch(`/api/youtube/music?q=${encodeURIComponent(q)}`)
          if (!res.ok) {
            const body = await res.json().catch(() => ({}))
            throw new Error(body.error || `Error ${res.status}`)
          }
          const data = (await res.json()) as { videos: MusicVideo[]; nextPageToken?: string }
          setVideos(data.videos)
          setNextPageToken(data.nextPageToken)
          setIsSearchMode(true)
          inputRef.current?.blur()
        } catch (err) {
          setError((err as Error).message)
          setVideos([])
        }
      })
    },
    [query]
  )

  const handleLoadMore = useCallback(async () => {
    if (!nextPageToken || isLoadingMore) return
    setIsLoadingMore(true)
    setError(null)

    try {
      const params = new URLSearchParams({ q: submittedQuery, pageToken: nextPageToken })
      const res = await fetch(`/api/youtube/music?${params.toString()}`)
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const data = (await res.json()) as { videos: MusicVideo[]; nextPageToken?: string }
      setVideos((prev) => [...prev, ...data.videos])
      setNextPageToken(data.nextPageToken)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsLoadingMore(false)
    }
  }, [nextPageToken, isLoadingMore, submittedQuery])

  const handleClear = useCallback(() => {
    setQuery('')
    setIsSearchMode(false)
    setVideos(initialVideos)
    setError(null)
    setNextPageToken(undefined)
    setSubmittedQuery('')
    inputRef.current?.focus()
  }, [initialVideos])

  return (
    <div className="pt-20 min-h-screen bg-black pb-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Hero header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-purple-500/15 border border-purple-500/25 text-purple-400 text-xs font-bold px-4 py-2 rounded-full uppercase tracking-widest mb-5">
            <Music2 className="w-3.5 h-3.5" />
            CarlosPN Music Station
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white mb-4 leading-tight">
            Tu música,{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-500 to-pink-500">
              sin interrupciones
            </span>
          </h1>
          <p className="text-slate-500 max-w-md mx-auto text-sm sm:text-base mb-5">
            Videos musicales en HD. Navega por toda la app sin perder la reproducción.
          </p>
          <Link
            href="/music/library"
            className="inline-flex items-center gap-2 bg-[#0d0d0d] hover:bg-[#111111] text-white font-semibold px-5 py-2.5 rounded-full text-sm border border-white/10 hover:border-purple-500/40 transition-all hover:scale-105"
          >
            <Library className="w-4 h-4 text-purple-400" />
            Mi biblioteca
            {savedCount > 0 && (
              <span className="bg-purple-600/25 text-purple-300 text-xs font-bold px-2 py-0.5 rounded-full">
                {savedCount}
              </span>
            )}
          </Link>
        </div>

        {/* Search form */}
        <form onSubmit={handleSearch} className="max-w-2xl mx-auto mb-12" role="search">
          <div className="relative flex items-center">
            <div className="absolute left-4 text-slate-500 pointer-events-none">
              {isPending ? (
                <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
              ) : (
                <Search className="w-5 h-5" />
              )}
            </div>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Artista, canción, álbum..."
              aria-label="Buscar música"
              enterKeyHint="search"
              autoComplete="off"
              className="w-full bg-[#0d0d0d] border border-white/12 text-white placeholder-slate-700 rounded-full pl-12 pr-32 py-4 text-base focus:outline-none focus:border-purple-500/60 focus:bg-[#111111] focus:ring-2 focus:ring-purple-500/15 transition-all duration-200"
            />
            <div className="absolute right-2 flex items-center gap-1">
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="p-1.5 text-slate-600 hover:text-white transition-colors rounded-full hover:bg-white/5"
                  aria-label="Limpiar"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                type="submit"
                disabled={!query.trim() || isPending}
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold px-5 py-2.5 rounded-full text-sm transition-all duration-200 hover:scale-105 disabled:hover:scale-100 shadow-lg shadow-purple-900/30"
              >
                {isPending ? 'Buscando...' : 'Buscar'}
              </button>
            </div>
          </div>
        </form>

        {/* Error message */}
        {error && (
          <div className="max-w-2xl mx-auto mb-8 flex items-start gap-3 bg-red-950/40 border border-red-900/50 text-red-400 rounded-xl px-5 py-4">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm">Error al cargar contenido</p>
              <p className="text-xs text-red-500/80 mt-0.5">{error}</p>
              {error.includes('YOUTUBE_API_KEY') && (
                <p className="text-xs text-slate-500 mt-2">
                  Agrega <code className="bg-black/50 px-1 rounded">YOUTUBE_API_KEY</code> en{' '}
                  <code className="bg-black/50 px-1 rounded">.env.local</code> y reinicia el servidor.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Section header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {isSearchMode ? (
              <>
                <div className="w-1 h-7 bg-gradient-to-b from-purple-500 to-pink-500 rounded-full" />
                <h2 className="text-white font-bold text-lg">
                  Resultados:{' '}
                  <span className="text-purple-400">&ldquo;{submittedQuery}&rdquo;</span>
                  {videos.length > 0 && (
                    <span className="text-slate-600 font-normal text-sm ml-2">
                      ({videos.length} videos)
                    </span>
                  )}
                </h2>
              </>
            ) : (
              <>
                <TrendingUp className="w-5 h-5 text-purple-500" />
                <h2 className="text-white font-bold text-lg">Tendencias Musicales</h2>
                <span className="text-slate-600 text-sm font-normal">México</span>
              </>
            )}
          </div>

          {isSearchMode && (
            <button
              onClick={handleClear}
              className="inline-flex items-center gap-1.5 text-slate-500 hover:text-white text-sm transition-all duration-200 px-3 py-1.5 rounded-full border border-white/10 hover:border-white/20 hover:bg-white/5"
            >
              <X className="w-3.5 h-3.5" />
              Limpiar
            </button>
          )}
        </div>

        {/* Loading skeleton */}
        {isPending && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="bg-[#0d0d0d] border border-white/8 rounded-xl overflow-hidden animate-pulse"
              >
                <div className="aspect-video bg-[#1a1a1a]" />
                <div className="p-3 space-y-2">
                  <div className="h-3 bg-[#1a1a1a] rounded w-full" />
                  <div className="h-3 bg-[#1a1a1a] rounded w-2/3" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Video grid */}
        {!isPending && videos.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {videos.map((video, index) => (
              <MusicCard
                key={`${video.id}-${index}`}
                video={video}
                allVideos={videos}
                index={index}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isPending && videos.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Music2 className="w-16 h-16 text-slate-800" />
            <p className="text-slate-500 text-lg">
              {isSearchMode
                ? `No se encontraron resultados para "${submittedQuery}"`
                : 'No hay tendencias disponibles'}
            </p>
          </div>
        )}

        {/* Load more */}
        {nextPageToken && !isPending && (
          <div className="flex justify-center mt-10">
            <button
              onClick={handleLoadMore}
              disabled={isLoadingMore}
              className="inline-flex items-center gap-2 bg-[#0d0d0d] hover:bg-[#111111] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-8 py-3.5 rounded-full border border-white/12 hover:border-purple-500/30 transition-all duration-200 hover:scale-105 disabled:hover:scale-100"
            >
              {isLoadingMore ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Cargando más...
                </>
              ) : (
                'Cargar más videos'
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
