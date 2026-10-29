'use client'

import { useState, useCallback, useTransition, useRef, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { readSession, writeSession } from '@/lib/session-cache'
import { Search, X, Film, Loader2, AlertCircle, TvMinimalPlay, TrendingUp, Heart, Clock3, ChevronDown, Play } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useVideoStore, type SavedVideo } from '@/store/videoStore'
import YoutubeCard from '@/components/YoutubeCard'
import { useMusicStore } from '@/store/musicStore'
import { useSearchSuggestions, rememberSearch } from '@/components/SearchSuggestions'
import type { YouTubeSearchItem, YouTubeVideoItem, VideoLang } from '@/lib/youtube'
import { parseDuration, formatViewCount } from '@/lib/youtube'
import { decodeEntities } from '@/lib/youtube-music'

interface VideoDetails {
  [videoId: string]: YouTubeVideoItem
}

// Idiomas de la sección (búsquedas y "más vistos")
const LANGS: { id: VideoLang; label: string; title: string; heading: string; description: string }[] = [
  { id: 'latino', label: '🇲🇽 Español latino', title: 'Español Latino', heading: 'Más vistos en español latino', description: 'Películas completas en español latino disponibles en YouTube.' },
  { id: 'castellano', label: '🇪🇸 Castellano', title: 'Castellano', heading: 'Más vistos en castellano', description: 'Películas completas dobladas en castellano (España) disponibles en YouTube.' },
  { id: 'ingles', label: '🇺🇸 Inglés', title: 'Inglés', heading: 'Más vistos en inglés', description: 'Full movies in English available on YouTube.' },
]
const LANG_KEY = 'cpn-video-lang'
const SAVED_OPEN_KEY = 'cpn-saved-videos-open'
const thumbOf = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`

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
  const videoDetailsRef = useRef(videoDetails)
  videoDetailsRef.current = videoDetails
  const [nextPageToken, setNextPageToken] = useState<string | undefined>(initialNextPageToken)
  const [isSearchMode, setIsSearchMode] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // ===== Idioma =====
  const [lang, setLang] = useState<VideoLang>('latino')
  const langRef = useRef<VideoLang>('latino')
  langRef.current = lang
  const langInfo = LANGS.find((l) => l.id === lang) ?? LANGS[0]

  // ===== Me gusta / Ver más tarde =====
  const { liked, watchLater, toggle, remove } = useVideoStore()
  const [mounted, setMounted] = useState(false)
  const [savedTab, setSavedTab] = useState<'liked' | 'watchLater'>('liked')
  const [savedOpen, setSavedOpen] = useState(true)
  useEffect(() => {
    setMounted(true)
    try {
      const l = localStorage.getItem(LANG_KEY)
      if (l === 'castellano' || l === 'ingles') setLang(l)
      setSavedOpen(localStorage.getItem(SAVED_OPEN_KEY) !== '0')
    } catch {}
  }, [])
  const likedIds = new Set(mounted ? liked.map((v) => v.id) : [])
  const laterIds = new Set(mounted ? watchLater.map((v) => v.id) : [])
  const toggleSaved = (list: 'liked' | 'watchLater', v: Omit<SavedVideo, 'addedAt'>) => toggle(list, v)

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

  const router = useRouter()
  const lastSearchedRef = useRef('')

  const runSearch = useCallback(
    (raw: string) => {
      const trimmed = raw.trim()
      if (!trimmed) return

      setError(null)
      setSubmittedQuery(trimmed)
      lastSearchedRef.current = trimmed
      // La búsqueda queda en la dirección (/cine?q=…): al volver atrás se recupera
      if (new URLSearchParams(window.location.search).get('q') !== trimmed) {
        router.replace(`/cine?q=${encodeURIComponent(trimmed)}`, { scroll: false })
      }

      // Resultados ya vistos en esta sesión (por idioma): al instante, sin gastar cuota
      const cacheKey = `video:${langRef.current}:${trimmed.toLowerCase()}`
      const cached = readSession<{ items: YouTubeSearchItem[]; nextPageToken?: string; details: VideoDetails }>(cacheKey)
      if (cached?.items) {
        setResults(cached.items)
        setNextPageToken(cached.nextPageToken)
        setVideoDetails((prev) => ({ ...prev, ...cached.details }))
        setIsSearchMode(true)
        return
      }

      startTransition(async () => {
        try {
          const res = await fetch(
            `/api/youtube/search?q=${encodeURIComponent(trimmed)}&lang=${langRef.current}`
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
          writeSession(cacheKey, { items: data.items, nextPageToken: data.nextPageToken, details })
        } catch (err) {
          setError((err as Error).message)
          setResults([])
        }
      })
    },
    [enrichWithDetails, router]
  )

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      rememberSearch('video', query)
      suggestions.close()
      runSearch(query)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, runSearch]
  )

  // Sugerencias mientras se escribe (autocompletado de YouTube + búsquedas recientes)
  const suggestions = useSearchSuggestions({
    kind: 'video',
    value: query,
    onChange: setQuery,
    onPick: (s) => {
      setQuery(s)
      inputRef.current?.blur()
      runSearch(s)
    },
  })

  // Búsqueda desde la barra superior (/cine?q=...)
  const searchParams = useSearchParams()
  const urlQuery = searchParams.get('q') || ''
  useEffect(() => {
    if (!urlQuery || urlQuery === lastSearchedRef.current) return
    setQuery(urlQuery)
    runSearch(urlQuery)
  }, [urlQuery, runSearch])

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
      params.set('lang', lang)

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
  }, [nextPageToken, isLoadingMore, isSearchMode, submittedQuery, enrichWithDetails, lang])

  // "Más vistos" del idioma elegido (la página trae los de español latino)
  const loadTrending = useCallback(
    async (l: VideoLang) => {
      if (l === 'latino') {
        setResults(initialItems)
        setVideoDetails(initialVideoDetails)
        setNextPageToken(initialNextPageToken)
        return
      }
      startTransition(async () => {
        try {
          const res = await fetch(`/api/youtube/search?lang=${l}`)
          if (!res.ok) throw new Error(`Error ${res.status}`)
          const data = (await res.json()) as { items: YouTubeSearchItem[]; nextPageToken?: string }
          setResults(data.items)
          setNextPageToken(data.nextPageToken)
          const details = await enrichWithDetails(data.items)
          setVideoDetails((prev) => ({ ...prev, ...details }))
        } catch (err) {
          setError((err as Error).message)
          setResults([])
        }
      })
    },
    [initialItems, initialVideoDetails, initialNextPageToken, enrichWithDetails]
  )

  const isFirstLang = useRef(true)
  useEffect(() => {
    // Al montar solo se recarga si el idioma guardado no es el latino
    if (isFirstLang.current) {
      isFirstLang.current = false
      if (lang === 'latino') return
    }
    setError(null)
    if (isSearchMode && submittedQuery) runSearch(submittedQuery)
    else loadTrending(lang)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang])

  const changeLang = (l: VideoLang) => {
    setLang(l)
    try {
      localStorage.setItem(LANG_KEY, l)
    } catch {}
  }

  const handleClearSearch = useCallback(() => {
    lastSearchedRef.current = ''
    router.replace('/cine', { scroll: false })
    setQuery('')
    setSubmittedQuery('')
    setIsSearchMode(false)
    setError(null)
    loadTrending(langRef.current)
    inputRef.current?.focus()
  }, [loadTrending, router])

  // El video suena en el reproductor de la app: ventana chica sobre la barra, sigue al cambiar
  // de pantalla y, al salir o bloquear el teléfono, continúa como audio
  const openPlayer = useCallback((videoId: string, title: string, channelTitle: string) => {
    const details = videoDetailsRef.current[videoId]
    useMusicStore.getState().play(
      [
        {
          id: videoId,
          title,
          channelTitle,
          thumbnail: thumbOf(videoId),
          publishedAt: '',
          description: '',
          duration: details?.contentDetails?.duration,
          isVideo: true,
        },
      ],
      0
    )
  }, [])

  return (
    <>

      <div className="pt-20 min-h-screen bg-obsidian">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-violet-600/20 border border-violet-600/30 text-violet-400 text-xs font-bold px-4 py-2 rounded-full uppercase tracking-widest mb-5">
              <TvMinimalPlay className="w-3.5 h-3.5" />
              CineLatino Pro
            </div>
            <h1 className="text-4xl sm:text-5xl font-black text-white mb-3 leading-tight">
              Películas en{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-500 to-violet-400">
                {langInfo.title}
              </span>
            </h1>
            <p className="text-slate-500 text-base max-w-lg mx-auto">{langInfo.description}</p>
          </div>

          <form onSubmit={handleSearch} className="max-w-2xl mx-auto mb-10" role="search">
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
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar película, saga, actor..."
                aria-label="Buscar películas en YouTube"
                enterKeyHint="search"
                className="w-full bg-surface-1 border border-white/15 text-white placeholder-slate-600 rounded-full pl-12 pr-28 sm:pr-36 py-4 text-base focus:outline-none focus:border-violet-500/70 focus:bg-surface-2 focus:ring-2 focus:ring-violet-500/20 transition-all duration-200"
                {...suggestions.inputProps}
              />
              {suggestions.dropdown}
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
                  className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-4 sm:px-5 py-2.5 rounded-full text-sm transition-all duration-200 hover:scale-105 disabled:hover:scale-100"
                >
                  {isPending ? 'Buscando...' : 'Buscar'}
                </button>
              </div>
            </div>
          </form>

          {error && (
            <div className="max-w-2xl mx-auto mb-8 flex items-start gap-3 bg-surface-1 border border-white/8 text-slate-300 rounded-xl px-5 py-4">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-violet-300" />
              <div>
                <p className="font-semibold text-sm text-white">No pudimos buscar en este momento</p>
                <p className="text-xs text-slate-400 mt-0.5">Intenta de nuevo en unos minutos o con otras palabras.</p>
              </div>
            </div>
          )}

          <Link
            href="/peliculas"
            className="mb-6 flex items-center gap-3 rounded-2xl border border-violet-500/30 bg-violet-500/10 px-4 py-3 hover:border-violet-400/60"
          >
            <Film className="w-5 h-5 text-violet-300 shrink-0" />
            <span className="text-sm text-slate-200">
              <b className="text-white">Películas gratis completas:</b> Pluto TV y clásicos de Internet Archive →
            </span>
          </Link>

          {/* Mis videos: Me gusta / Ver más tarde */}
          {mounted && (liked.length > 0 || watchLater.length > 0) && (
            <section className="mb-8 bg-surface-1/60 border border-white/8 rounded-2xl p-3">
              <div className="flex items-center gap-2">
                {([
                  ['liked', Heart, 'Me gusta', liked.length],
                  ['watchLater', Clock3, 'Ver más tarde', watchLater.length],
                ] as const).map(([id, Icon, label, count]) => (
                  <button
                    key={id}
                    onClick={() => {
                      setSavedTab(id)
                      if (!savedOpen) {
                        setSavedOpen(true)
                        try { localStorage.setItem(SAVED_OPEN_KEY, '1') } catch {}
                      }
                    }}
                    className={`shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-[13px] font-semibold font-display transition-colors ${
                      savedTab === id && savedOpen ? 'bg-violet-300 text-violet-950' : 'bg-surface-2/70 text-slate-300 hover:text-white'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${id === 'liked' && savedTab === id && savedOpen ? 'fill-violet-950' : ''}`} />
                    {label} <span className="opacity-70">({count})</span>
                  </button>
                ))}
                <button
                  onClick={() => {
                    setSavedOpen((o) => {
                      try { localStorage.setItem(SAVED_OPEN_KEY, o ? '0' : '1') } catch {}
                      return !o
                    })
                  }}
                  className="ml-auto w-9 h-9 rounded-full flex items-center justify-center text-violet-300"
                  aria-label={savedOpen ? 'Plegar mis videos' : 'Mostrar mis videos'}
                  aria-expanded={savedOpen}
                >
                  <ChevronDown className={`w-5 h-5 transition-transform ${savedOpen ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {savedOpen && (
                (savedTab === 'liked' ? liked : watchLater).length === 0 ? (
                  <p className="text-slate-500 text-sm px-1 pt-3">
                    {savedTab === 'liked' ? 'Aún no tienes videos con Me gusta.' : 'No tienes videos para ver más tarde.'}
                  </p>
                ) : (
                  <div className="flex gap-3 overflow-x-auto mt-3 -mx-1 px-1 pb-1 snap-x [scrollbar-width:none]">
                    {(savedTab === 'liked' ? liked : watchLater).map((v) => (
                      <div key={v.id} className="relative shrink-0 w-48 sm:w-56 snap-start">
                        <button onClick={() => openPlayer(v.id, v.title, v.channelTitle)} className="block w-full text-left group">
                          <div className="relative aspect-video rounded-lg overflow-hidden bg-surface-2">
                            <Image src={v.thumbnail} alt={v.title} fill sizes="224px" className="object-cover group-hover:scale-105 transition-transform duration-500" />
                            <span className="absolute inset-0 flex items-center justify-center bg-black/20">
                              <span className="w-9 h-9 rounded-full bg-violet-500/90 flex items-center justify-center">
                                <Play className="w-4 h-4 text-white fill-white ml-0.5" />
                              </span>
                            </span>
                          </div>
                          <p className="text-white text-xs font-semibold leading-snug line-clamp-2 mt-1.5">{v.title}</p>
                          <p className="text-slate-500 text-[11px] truncate">{v.channelTitle}</p>
                        </button>
                        <button
                          onClick={() => remove(savedTab, v.id)}
                          className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/70 text-white flex items-center justify-center"
                          aria-label={`Quitar ${v.title}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )
              )}
            </section>
          )}

          {/* Idioma */}
          <div className="flex gap-2 overflow-x-auto pb-1 mb-6 -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]" role="tablist" aria-label="Idioma">
            {LANGS.map((l) => (
              <button
                key={l.id}
                role="tab"
                aria-selected={lang === l.id}
                onClick={() => changeLang(l.id)}
                className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold font-display transition-colors ${
                  lang === l.id ? 'bg-violet-500 text-white shadow-glow' : 'bg-surface-2/60 border border-white/8 text-slate-300 hover:text-white'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>

          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isSearchMode ? (
                <>
                  <div className="w-1 h-7 bg-violet-500 rounded-full" />
                  <div>
                    <h2 className="text-white font-bold text-lg leading-tight">
                      Resultados:{' '}
                      <span className="text-violet-400">&ldquo;{submittedQuery}&rdquo;</span>
                    </h2>
                    <p className="text-slate-600 text-xs">{results.length} videos encontrados</p>
                  </div>
                </>
              ) : (
                <>
                  <TrendingUp className="w-5 h-5 text-violet-500" />
                  <h2 className="text-white font-bold text-lg">{langInfo.heading}</h2>
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
                <div key={i} className="bg-surface-1 border border-white/10 rounded-xl overflow-hidden animate-pulse">
                  <div className="aspect-video bg-surface-2" />
                  <div className="p-3 space-y-2">
                    <div className="h-4 bg-surface-2 rounded w-full" />
                    <div className="h-3 bg-surface-2 rounded w-2/3" />
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
                    liked={likedIds.has(item.id.videoId)}
                    later={laterIds.has(item.id.videoId)}
                    onToggleLike={() =>
                      toggleSaved('liked', {
                        id: item.id.videoId,
                        title: decodeEntities(item.snippet.title),
                        channelTitle: decodeEntities(item.snippet.channelTitle),
                        thumbnail: thumbOf(item.id.videoId),
                        duration,
                      })
                    }
                    onToggleLater={() =>
                      toggleSaved('watchLater', {
                        id: item.id.videoId,
                        title: decodeEntities(item.snippet.title),
                        channelTitle: decodeEntities(item.snippet.channelTitle),
                        thumbnail: thumbOf(item.id.videoId),
                        duration,
                      })
                    }
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
                className="inline-flex items-center gap-2 bg-surface-1 hover:bg-surface-2 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold px-8 py-3.5 rounded-full border border-white/15 hover:border-violet-500/40 transition-all duration-200 hover:scale-105 disabled:hover:scale-100"
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
