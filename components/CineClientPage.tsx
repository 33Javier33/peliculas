'use client'

import { useState, useCallback, useTransition, useRef } from 'react'
import { Search, X, Film, Loader2, AlertCircle, TvMinimalPlay, TrendingUp } from 'lucide-react'
import YoutubeCard from '@/components/YoutubeCard'
import YoutubePlayer from '@/components/YoutubePlayer'
import type { YouTubeSearchItem, YouTubeVideoItem } from '@/lib/youtube'
import { parseDuration, formatViewCount } from '@/lib/youtube'

interface VideoDetails {
  [videoId: string]: YouTubeVideoItem
}

interface PlayerState {
  videoId: string
  title: string
  channelTitle: string
}

interface CineClientPageProps {
  initialItems: YouTubeSearchItem[]
  initialNextPageToken?: string
  initialVideoDetails: VideoDetails
}

export default function CineClientPage({
  initialItems,
  initialNextPageToken,
  initialVideoDetails,
}: CineClientPageProps) {
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [results, setResults] = useState<YouTubeSearchItem[]>(initialItems)
  const [videoDetails, setVideoDetails] = useState<VideoDetails>(initialVideoDetails)
  const [nextPageToken, setNextPageToken] = useState<string | undefined>(initialNextPageToken)
  const [isSearchMode, setIsSearchMode] = useState(false)
  const [player, setPlayer] = useState<PlayerState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const enrichWithDetails = useCallback(async (items: YouTubeSearchItem[]) => {
    const ids = items.map((i) => i.id.videoId).filter(Boolean)
    if (ids.length === 0) return {}
    try {
      const res = await fetch(`/api/youtube/details?ids=${ids.join(',')}`)
      if (!res.ok) return {}
      const data = await res.json() as { items: YouTubeVideoItem[] }
      const map: VideoDetails = {}
      for (const v of data.items) {
        map[v.id] = v
      }
      return map
    } catch {
      return {}
    }
  }, [])

  const handleSearch = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      const trimmed = query.trim()
      if (!trimmed) return

      setError(null)
      setSubmittedQuery(trimmed)

      startTransition(async () => {
        try {
          const res = await fetch(
            `/api/youtube/search?q=${encodeURIComponent(trimmed)}`
          )
          if (!res.ok) {
            const body = await res.json().catch(() => ({}))
            throw new Error(body.error || `Error ${res.status}`)
          }
          const data = await res.json() as {
            items: YouTubeSearchItem[]
            nextPageToken?: string
          }
          setResults(data.items)
          setNextPageToken(data.nextPageToken)
          setIsSearchMode(true)

          const details = await enrichWithDetails(data.items)
          setVideoDetails((prev) => ({ ...prev, ...details }))
        } catch (err) {
          setError((err as Error).message)
          setResults([])
        }
      })
    },
    [query, enrichWithDetails]
  )

  const handleLoadMore = useCallback(async () => {
    if (!nextPageToken || isLoadingMore) return
    setIsLoadingMore(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (isSearchMode && submittedQuery) {
        params.set('q', submittedQuery)
      }
      params.set('pageToken', nextPageToken)

      const res = await fetch(`/api/youtube/search?${params.toString()}`)
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const data = await res.json() as {
        items: YouTubeSearchItem[]
        nextPageToken?: string
      }

      setResults((prev) => [...prev, ...data.items])
      setNextPageToken(data.nextPageToken)

      const details = await enrichWithDetails(data.items)
      setVideoDetails((prev) => ({ ...prev, ...details }))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsLoadingMore(false)
    }
  }, [nextPageToken, isLoadingMore, isSearchMode, submittedQuery, enrichWithDetails])

  const handleClearSearch = useCallback(() => {
    setQuery('')
    setSubmittedQuery('')
    setIsSearchMode(false)
    setResults(initialItems)
    setVideoDetails(initialVideoDetails)
    setNextPageToken(initialNextPageToken)
    setError(null)
    inputRef.current?.focus()
  }, [initialItems, initialVideoDetails, initialNextPageToken])

  const openPlayer = useCallback(
    (videoId: string, title: string, channelTitle: string) => {
      setPlayer({ videoId, title, channelTitle })
    },
    []
  )

  const closePlayer = useCallback(() => {
    setPlayer(null)
  }, [])

  return (
    <>
      {player && (
        <YoutubePlayer
          videoId={player.videoId}
          title={player.title}
          channelTitle={player.channelTitle}
          onClose={closePlayer}
        />
      )}

      <div className="pt-20 min-h-screen bg-black">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-red-600/20 border border-red-600/30 text-red-400 text-xs font-bold px-4 py-2 rounded-full uppercase tracking-widest mb-5">
              <TvMinimalPlay className="w-3.5 h-3.5" />
              CineLatino Pro
            </div>
            <h1 className="text-4xl sm:text-5xl font-black text-white mb-3 leading-tight">
              Películas en{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-red-400">
                Español Latino
              </span>
            </h1>
            <p className="text-slate-500 text-base max-w-lg mx-auto">
              Busca películas completas disponibles en YouTube. Contenido en español latino y HD.
            </p>
          </div>

          <form onSubmit={handleSearch} className="max-w-2xl mx-auto mb-10" role="search">
            <div className="relative flex items-center">
              <div className="absolute left-4 text-slate-500 pointer-events-none">
                {isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin text-red-500" />
                ) : (
                  <Search className="w-5 h-5" />
                )}
              </div>
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar película, saga, actor..."
                aria-label="Buscar películas en YouTube"
                enterKeyHint="search"
                autoComplete="off"
                className="w-full bg-[#111111] border border-white/15 text-white placeholder-slate-600 rounded-full pl-12 pr-28 sm:pr-36 py-4 text-base focus:outline-none focus:border-red-500/70 focus:bg-[#161616] focus:ring-2 focus:ring-red-500/20 transition-all duration-200"
              />
              <div className="absolute right-2 flex items-center gap-1">
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="p-1.5 text-slate-500 hover:text-white transition-colors rounded-full hover:bg-white/10"
                    aria-label="Limpiar"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="submit"
                  disabled={!query.trim() || isPending}
                  className="bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-4 sm:px-5 py-2.5 rounded-full text-sm transition-all duration-200 hover:scale-105 disabled:hover:scale-100"
                >
                  {isPending ? 'Buscando...' : 'Buscar'}
                </button>
              </div>
            </div>
          </form>

          {error && (
            <div className="max-w-2xl mx-auto mb-8 flex items-start gap-3 bg-red-900/20 border border-red-800/50 text-red-400 rounded-xl px-5 py-4">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm">Error al cargar resultados</p>
                <p className="text-xs text-red-500 mt-0.5">{error}</p>
                {error.includes('YOUTUBE_API_KEY') && (
                  <p className="text-xs text-slate-400 mt-2">
                    Agrega <code className="bg-black/40 px-1 rounded">YOUTUBE_API_KEY</code> en
                    tu archivo <code className="bg-black/40 px-1 rounded">.env.local</code>
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isSearchMode ? (
                <>
                  <div className="w-1 h-7 bg-red-500 rounded-full" />
                  <div>
                    <h2 className="text-white font-bold text-lg leading-tight">
                      Resultados:{' '}
                      <span className="text-red-400">&ldquo;{submittedQuery}&rdquo;</span>
                    </h2>
                    <p className="text-slate-600 text-xs">{results.length} videos encontrados</p>
                  </div>
                </>
              ) : (
                <>
                  <TrendingUp className="w-5 h-5 text-red-500" />
                  <h2 className="text-white font-bold text-lg">Más vistos en Español</h2>
                </>
              )}
            </div>

            {isSearchMode && (
              <button
                onClick={handleClearSearch}
                className="inline-flex items-center gap-1.5 text-slate-500 hover:text-white text-sm transition-colors duration-200 hover:bg-white/5 px-3 py-1.5 rounded-full border border-white/10 hover:border-white/20"
              >
                <X className="w-3.5 h-3.5" />
                Limpiar
              </button>
            )}
          </div>

          {results.length === 0 && !isPending && !error && (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <Film className="w-16 h-16 text-slate-800" />
              <p className="text-slate-500 text-lg">
                {isSearchMode
                  ? `No se encontraron resultados para "${submittedQuery}"`
                  : 'No hay contenido disponible'}
              </p>
            </div>
          )}

          {isPending && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="bg-[#111111] border border-white/10 rounded-xl overflow-hidden animate-pulse">
                  <div className="aspect-video bg-[#1a1a1a]" />
                  <div className="p-3 space-y-2">
                    <div className="h-4 bg-[#1a1a1a] rounded w-full" />
                    <div className="h-3 bg-[#1a1a1a] rounded w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isPending && results.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {results.map((item) => {
                const details = videoDetails[item.id.videoId]
                const duration = details?.contentDetails?.duration
                  ? parseDuration(details.contentDetails.duration)
                  : undefined
                const viewCount = details?.statistics?.viewCount
                  ? formatViewCount(details.statistics.viewCount)
                  : undefined

                return (
                  <YoutubeCard
                    key={item.id.videoId}
                    item={item}
                    duration={duration}
                    viewCount={viewCount}
                    onClick={openPlayer}
                  />
                )
              })}
            </div>
          )}

          {nextPageToken && !isPending && (
            <div className="flex justify-center mt-10">
              <button
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                className="inline-flex items-center gap-2 bg-[#111111] hover:bg-[#1a1a1a] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold px-8 py-3.5 rounded-full border border-white/15 hover:border-red-500/40 transition-all duration-200 hover:scale-105 disabled:hover:scale-100"
              >
                {isLoadingMore ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Cargando más...
                  </>
                ) : (
                  'Cargar más resultados'
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
