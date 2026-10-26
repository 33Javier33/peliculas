'use client'

import { useState, useCallback, useTransition, useRef, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Search, X, Loader2, AlertCircle, Music2, TrendingUp, Library, Sparkles } from 'lucide-react'
import MusicCard from '@/components/MusicCard'
import { useMusicStore } from '@/store/musicStore'
import type { MusicVideo, ForYouResult } from '@/lib/youtube-music'

const FOR_YOU_CACHE_KEY = 'cpn-for-you'
const FOR_YOU_TTL_MS = 6 * 60 * 60 * 1000

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

  // ===== "Para ti": según lo que escuchas =====
  const history = useMusicStore((s) => s.history)
  const hasHydrated = useMusicStore((s) => s.hasHydrated)
  const [tab, setTab] = useState<'foryou' | 'trending'>('foryou')
  const [forYou, setForYou] = useState<ForYouResult | null>(null)
  const [isForYouLoading, setIsForYouLoading] = useState(false)

  // Perfil: artistas más escuchados últimamente (lo reciente pesa más) + ids recientes
  const profile = useMemo(() => {
    const recent = history.slice(0, 30)
    const score = new Map<string, number>()
    recent.forEach((h, i) => {
      const artist = h.artist || h.channelTitle
      if (!artist) return
      const weight = (h.plays || 1) * (1 + (30 - i) / 10)
      score.set(artist, (score.get(artist) ?? 0) + weight)
    })
    const artists = Array.from(score.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([a]) => a)
    return { artists, ids: recent.slice(0, 20).map((h) => h.id) }
  }, [history])
  const profileKey = profile.artists.join('|')

  useEffect(() => {
    if (!hasHydrated || !profileKey) return
    // Caché local para no gastar cuota de YouTube en cada visita
    try {
      const cached = JSON.parse(localStorage.getItem(FOR_YOU_CACHE_KEY) || 'null')
      if (cached?.key === profileKey && Date.now() - cached.at < FOR_YOU_TTL_MS && cached.data?.videos?.length) {
        setForYou(cached.data)
        return
      }
    } catch {}

    let cancelled = false
    setIsForYouLoading(true)
    const params = new URLSearchParams({ ids: profile.ids.join(',') })
    profile.artists.forEach((a) => params.append('artist', a))
    fetch(`/api/youtube/for-you?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ForYouResult | null) => {
        if (cancelled || !data?.videos?.length) return
        setForYou(data)
        try {
          localStorage.setItem(FOR_YOU_CACHE_KEY, JSON.stringify({ key: profileKey, at: Date.now(), data }))
        } catch {}
      })
      .catch(() => {})
      .finally(() => !cancelled && setIsForYouLoading(false))
    return () => {
      cancelled = true
    }
    // profile.ids cambia con cada canción; solo recalculamos cuando cambian tus artistas
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated, profileKey])

  const showForYou = !isSearchMode && tab === 'foryou' && (!!forYou || isForYouLoading)
  const forYouSubtitle = forYou
    ? [...forYou.genres.map((g) => g.charAt(0).toUpperCase() + g.slice(1)), ...forYou.artists].slice(0, 4).join(' · ')
    : ''

  const runSearch = useCallback(
    (raw: string) => {
      const q = raw.trim()
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
    []
  )

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      runSearch(query)
    },
    [query, runSearch]
  )

  // Búsqueda desde la barra superior (/music?q=...)
  const searchParams = useSearchParams()
  const urlQuery = searchParams.get('q') || ''
  useEffect(() => {
    if (!urlQuery) return
    setQuery(urlQuery)
    runSearch(urlQuery)
  }, [urlQuery, runSearch])

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
    <div className="pt-20 min-h-screen bg-obsidian pb-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Hero header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-violet-500/15 border border-violet-500/25 text-violet-400 text-xs font-bold px-4 py-2 rounded-full uppercase tracking-widest mb-5">
            <Music2 className="w-3.5 h-3.5" />
            Carlos P. Nauto Music Station
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white mb-4 leading-tight">
            Tu música,{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-500 to-purple-500">
              sin interrupciones
            </span>
          </h1>
          <p className="text-slate-500 max-w-md mx-auto text-sm sm:text-base mb-5">
            Videos musicales en HD. Navega por toda la app sin perder la reproducción.
          </p>
          <Link
            href="/music/library"
            className="inline-flex items-center gap-2 bg-surface-1 hover:bg-surface-1 text-white font-semibold px-5 py-2.5 rounded-full text-sm border border-white/10 hover:border-violet-500/40 transition-all hover:scale-105"
          >
            <Library className="w-4 h-4 text-violet-400" />
            Mi biblioteca
            {savedCount > 0 && (
              <span className="bg-violet-600/25 text-violet-300 text-xs font-bold px-2 py-0.5 rounded-full">
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
                <Loader2 className="w-5 h-5 animate-spin text-violet-500" />
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
              className="w-full bg-surface-1 border border-white/12 text-white placeholder-slate-700 rounded-full pl-12 pr-32 py-4 text-base focus:outline-none focus:border-violet-500/60 focus:bg-surface-1 focus:ring-2 focus:ring-violet-500/15 transition-all duration-200"
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
                className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold px-5 py-2.5 rounded-full text-sm transition-all duration-200 hover:scale-105 disabled:hover:scale-100 shadow-lg shadow-violet-900/30"
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
          <div className="flex items-center gap-3 min-w-0">
            {isSearchMode ? (
              <>
                <div className="w-1 h-7 bg-gradient-to-b from-violet-500 to-purple-500 rounded-full" />
                <h2 className="text-white font-bold text-lg">
                  Resultados:{' '}
                  <span className="text-violet-400">&ldquo;{submittedQuery}&rdquo;</span>
                  {videos.length > 0 && (
                    <span className="text-slate-600 font-normal text-sm ml-2">
                      ({videos.length} videos)
                    </span>
                  )}
                </h2>
              </>
            ) : (
              <div className="min-w-0">
                {(forYou || isForYouLoading) && (
                  <div className="flex items-center gap-2 mb-2" role="tablist">
                    <button
                      role="tab"
                      aria-selected={tab === 'foryou'}
                      onClick={() => setTab('foryou')}
                      className={`inline-flex items-center gap-1.5 text-sm font-semibold px-3.5 py-1.5 rounded-full border transition-colors ${
                        tab === 'foryou'
                          ? 'bg-violet-600 border-violet-500 text-white'
                          : 'border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" /> Para ti
                    </button>
                    <button
                      role="tab"
                      aria-selected={tab === 'trending'}
                      onClick={() => setTab('trending')}
                      className={`inline-flex items-center gap-1.5 text-sm font-semibold px-3.5 py-1.5 rounded-full border transition-colors ${
                        tab === 'trending'
                          ? 'bg-violet-600 border-violet-500 text-white'
                          : 'border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      <TrendingUp className="w-3.5 h-3.5" /> Tendencias
                    </button>
                  </div>
                )}
                {showForYou ? (
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <h2 className="text-white font-bold text-lg">Para ti</h2>
                    <span className="text-slate-500 text-sm font-normal truncate">
                      {forYouSubtitle ? `según lo que escuchas: ${forYouSubtitle}` : 'según lo que escuchas'}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <TrendingUp className="w-5 h-5 text-violet-500" />
                    <h2 className="text-white font-bold text-lg">Tendencias Musicales</h2>
                    <span className="text-slate-600 text-sm font-normal">México</span>
                  </div>
                )}
              </div>
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
        {(isPending || (showForYou && !forYou)) && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="bg-surface-1 border border-white/8 rounded-xl overflow-hidden animate-pulse"
              >
                <div className="aspect-video bg-surface-2" />
                <div className="p-3 space-y-2">
                  <div className="h-3 bg-surface-2 rounded w-full" />
                  <div className="h-3 bg-surface-2 rounded w-2/3" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Video grid */}
        {!isPending && showForYou && forYou && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {forYou.videos.map((video, index) => (
              <MusicCard key={`fy-${video.id}-${index}`} video={video} allVideos={forYou.videos} index={index} />
            ))}
          </div>
        )}

        {!isPending && !showForYou && videos.length > 0 && (
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
        {!isPending && !showForYou && videos.length === 0 && !error && (
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
        {nextPageToken && !isPending && !showForYou && (
          <div className="flex justify-center mt-10">
            <button
              onClick={handleLoadMore}
              disabled={isLoadingMore}
              className="inline-flex items-center gap-2 bg-surface-1 hover:bg-surface-1 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-8 py-3.5 rounded-full border border-white/12 hover:border-violet-500/30 transition-all duration-200 hover:scale-105 disabled:hover:scale-100"
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
