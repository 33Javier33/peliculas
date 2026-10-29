'use client'

import { TrackStateOverlay } from '@/components/TrackState'
import FollowedArtistsSection from '@/components/FollowedArtistsSection'
import { useState, useCallback, useTransition, useRef, useEffect, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { readSession, writeSession, patchSession } from '@/lib/session-cache'
import Link from 'next/link'
import Image from 'next/image'
import { Search, X, Loader2, AlertCircle, Music2, TrendingUp, Library, History, TvMinimalPlay, Radio as RadioIcon, Tv, ChevronLeft, ChevronRight, Play } from 'lucide-react'
import MusicCard from '@/components/MusicCard'
import { useSearchSuggestions, rememberSearch } from '@/components/SearchSuggestions'
import { useMusicStore } from '@/store/musicStore'
import type { MusicVideo, ForYouResult } from '@/lib/youtube-music'
import type { CatalogArtist, CatalogAlbum } from '@/lib/catalog'

interface SearchCache {
  videos?: MusicVideo[]
  nextPageToken?: string
  catalog?: { artists: CatalogArtist[]; albums: CatalogAlbum[] }
}

const FOR_YOU_CACHE_KEY = 'cpn-for-you'
const FOR_YOU_TTL_MS = 6 * 60 * 60 * 1000

interface MusicSearchClientProps {
  initialVideos: MusicVideo[]
}

export default function MusicSearchClient({ initialVideos }: MusicSearchClientProps) {
  const savedCount = useMusicStore((s) => s.saved.length)
  const [query, setQuery] = useState('')
  const [videos, setVideos] = useState<MusicVideo[]>(initialVideos)
  // Tendencias del país donde estás (la página trae México como respaldo)
  const [trending, setTrending] = useState<MusicVideo[]>(initialVideos)
  const [trendRegion, setTrendRegion] = useState<string | null>(null)
  const isSearchModeRef = useRef(false)
  const [nextPageToken, setNextPageToken] = useState<string | undefined>()
  const [isSearchMode, setIsSearchMode] = useState(false)
  const [catalog, setCatalog] = useState<{ artists: CatalogArtist[]; albums: CatalogAlbum[] } | null>(null)
  isSearchModeRef.current = isSearchMode

  useEffect(() => {
    let cancelled = false
    fetch('/api/youtube/music')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { videos?: MusicVideo[]; region?: string } | null) => {
        if (cancelled) return
        if (data?.videos?.length) {
          setTrending(data.videos)
          if (!isSearchModeRef.current) setVideos(data.videos)
        }
        setTrendRegion(data?.region || 'MX')
      })
      .catch(() => !cancelled && setTrendRegion('MX'))
    return () => {
      cancelled = true
    }
  }, [])

  const regionName = useMemo(() => {
    if (!trendRegion) return ''
    try {
      return new Intl.DisplayNames(['es'], { type: 'region' }).of(trendRegion) || trendRegion
    } catch {
      return trendRegion
    }
  }, [trendRegion])
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // ===== "Para ti": según lo que escuchas =====
  const history = useMusicStore((s) => s.history)
  const hasHydrated = useMusicStore((s) => s.hasHydrated)
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

  const play = useMusicStore((s) => s.play)
  const recent = useMemo(() => history.slice(0, 6), [history])
  const carouselRef = useRef<HTMLDivElement>(null)
  const scrollCarousel = (dir: 1 | -1) =>
    carouselRef.current?.scrollBy({ left: dir * carouselRef.current.clientWidth * 0.8, behavior: 'smooth' })

  // Saludo según la hora (se calcula en el cliente para evitar desajustes de hidratación)
  const [greeting, setGreeting] = useState<{ title: string; session: string } | null>(null)
  useEffect(() => {
    const h = new Date().getHours()
    setGreeting(
      h >= 5 && h < 12
        ? { title: 'Buenos días', session: 'Sesión matutina' }
        : h >= 12 && h < 19
          ? { title: 'Buenas tardes', session: 'Sesión de tarde' }
          : { title: 'Buenas noches', session: 'Sesión nocturna' }
    )
  }, [])
  const forYouSubtitle = forYou
    ? [...forYou.genres.map((g) => g.charAt(0).toUpperCase() + g.slice(1)), ...forYou.artists].slice(0, 4).join(' · ')
    : ''

  const router = useRouter()
  const lastSearchedRef = useRef('')

  const runSearch = useCallback(
    (raw: string) => {
      const q = raw.trim()
      if (!q) return

      setError(null)
      setSubmittedQuery(q)
      lastSearchedRef.current = q
      // La búsqueda queda en la dirección (/music?q=…): al volver atrás se recupera
      if (new URLSearchParams(window.location.search).get('q') !== q) {
        router.replace(`/music?q=${encodeURIComponent(q)}`, { scroll: false })
      }

      // Resultados ya vistos en esta sesión: al instante, sin gastar cuota
      const cacheKey = `music:${q.toLowerCase()}`
      const cached = readSession<SearchCache>(cacheKey)
      if (cached?.videos) {
        setVideos(cached.videos)
        setNextPageToken(cached.nextPageToken)
        setCatalog(cached.catalog ?? null)
        setIsSearchMode(true)
        return
      }

      // Artistas y álbumes completos (catálogo) en paralelo con las canciones
      setCatalog(null)
      fetch(`/api/catalog/search?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { artists: CatalogArtist[]; albums: CatalogAlbum[] } | null) => {
          if (!d) return
          setCatalog(d)
          patchSession<SearchCache>(cacheKey, { catalog: d })
        })
        .catch(() => {})

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
          patchSession<SearchCache>(cacheKey, { videos: data.videos, nextPageToken: data.nextPageToken })
          inputRef.current?.blur()
        } catch (err) {
          setError((err as Error).message)
          setVideos([])
        }
      })
    },
    [router]
  )

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      rememberSearch('music', query)
      suggestions.close()
      runSearch(query)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, runSearch]
  )

  // Sugerencias mientras se escribe (autocompletado de YouTube + búsquedas recientes)
  const suggestions = useSearchSuggestions({
    kind: 'music',
    value: query,
    onChange: setQuery,
    onPick: (s) => {
      setQuery(s)
      inputRef.current?.blur()
      runSearch(s)
    },
  })

  // Búsqueda desde la barra superior (/music?q=...)
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
      const params = new URLSearchParams({ q: submittedQuery, pageToken: nextPageToken })
      const res = await fetch(`/api/youtube/music?${params.toString()}`)
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const data = (await res.json()) as { videos: MusicVideo[]; nextPageToken?: string }
      setVideos((prev) => {
        const all = [...prev, ...data.videos]
        writeSession<SearchCache>(`music:${submittedQuery.toLowerCase()}`, {
          ...(readSession<SearchCache>(`music:${submittedQuery.toLowerCase()}`) ?? {}),
          videos: all,
          nextPageToken: data.nextPageToken,
        })
        return all
      })
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
    setVideos(trending)
    setError(null)
    setNextPageToken(undefined)
    setSubmittedQuery('')
    setCatalog(null)
    lastSearchedRef.current = ''
    router.replace('/music', { scroll: false })
    inputRef.current?.focus()
  }, [trending, router])

  const chip =
    'shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold font-display transition-colors'
  const chipIdle = `${chip} bg-surface-2/60 border border-white/8 text-slate-300 hover:text-white`

  return (
    <div className="pt-20 min-h-screen bg-obsidian pb-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Saludo */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-emerald-400 text-[11px] font-bold uppercase tracking-[0.08em] font-display h-4">
              {greeting && (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                  {greeting.session}
                </>
              )}
            </p>
            <h1 className="text-[32px] leading-[38px] sm:text-[40px] sm:leading-[48px] font-extrabold text-white mt-1">
              {greeting?.title ?? '\u00a0'}
            </h1>
          </div>
          <Link
            href="/music/library"
            className="shrink-0 w-12 h-12 rounded-full bg-surface-2 border border-white/8 flex items-center justify-center text-slate-300 hover:text-white transition-colors"
            aria-label="Historial y biblioteca"
            title="Historial y biblioteca"
          >
            <History className="w-5 h-5" />
          </Link>
        </div>

        {/* Chips de sección */}
        <div className="flex gap-2 overflow-x-auto pb-1 mb-6 -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">
          <span className={`${chip} bg-violet-300 text-violet-950`}>
            <Music2 className="w-4 h-4" /> Música
          </span>
          <Link href="/cine" className={chipIdle}>
            <TvMinimalPlay className="w-4 h-4 text-violet-300" /> Videos
          </Link>
          <Link href="/radio" className={chipIdle}>
            <RadioIcon className="w-4 h-4 text-emerald-400" /> Radio
          </Link>
          <Link href="/tv" className={chipIdle}>
            <Tv className="w-4 h-4 text-violet-300" /> TV
          </Link>
          <Link href="/music/library" className={chipIdle}>
            <Library className="w-4 h-4 text-emerald-400" /> Biblioteca
            {savedCount > 0 && <span className="text-xs text-slate-500">{savedCount}</span>}
          </Link>
        </div>

        {/* Búsqueda */}
        <form onSubmit={handleSearch} className="mb-8" role="search">
          <div className="relative flex items-center">
            <div className="absolute left-4 text-slate-400 pointer-events-none">
              {isPending ? <Loader2 className="w-5 h-5 animate-spin text-violet-400" /> : <Search className="w-5 h-5" />}
            </div>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Artista, canción, álbum..."
              aria-label="Buscar música"
              enterKeyHint="search"
              className="w-full bg-surface-1 border border-white/8 text-white placeholder-slate-500 rounded-full pl-12 pr-28 py-3.5 text-base focus:outline-none focus:border-violet-500 transition-colors"
              {...suggestions.inputProps}
            />
            {suggestions.dropdown}
            <div className="absolute right-1.5 flex items-center gap-1">
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="p-1.5 text-slate-500 hover:text-white transition-colors rounded-full"
                  aria-label="Limpiar"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                type="submit"
                disabled={!query.trim() || isPending}
                className="bg-violet-500 hover:bg-violet-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold px-4 py-2 rounded-full text-sm transition-colors"
              >
                Buscar
              </button>
            </div>
          </div>
        </form>

        {/* Error (sin mensajes técnicos) */}
        {error && (
          <div className="mb-8 flex items-start gap-3 bg-surface-1 border border-white/8 text-slate-300 rounded-xl px-5 py-4">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-violet-300" />
            <div>
              <p className="font-semibold text-sm text-white">No pudimos buscar en este momento</p>
              <p className="text-xs text-slate-400 mt-0.5">Intenta de nuevo en unos minutos o con otras palabras.</p>
            </div>
          </div>
        )}

        {isSearchMode || isPending ? (
          /* ===== Resultados de búsqueda ===== */
          <section>
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-white font-bold text-[22px] leading-7 min-w-0 truncate">
                {isPending ? 'Buscando...' : <>Resultados: <span className="text-violet-300">&ldquo;{submittedQuery}&rdquo;</span></>}
              </h2>
              {isSearchMode && (
                <button
                  onClick={handleClear}
                  className="shrink-0 inline-flex items-center gap-1.5 text-slate-400 hover:text-white text-sm px-3 py-1.5 rounded-full border border-white/8"
                >
                  <X className="w-3.5 h-3.5" /> Limpiar
                </button>
              )}
            </div>
            {/* Artistas y álbumes (como en Spotify) */}
            {catalog && catalog.artists.length > 0 && (
              <div className="mb-7">
                <h3 className="text-slate-400 text-xs font-bold uppercase tracking-[0.08em] font-display mb-3">Artistas</h3>
                <div className="flex gap-4 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">
                  {catalog.artists.map((a) => (
                    <Link key={a.id} href={`/music/artist/${a.id}`} className="group shrink-0 w-24 text-center">
                      <div className="relative w-24 h-24 rounded-full overflow-hidden bg-surface-2 border border-white/8">
                        {a.picture && <Image src={a.picture} alt={a.name} fill sizes="96px" className="object-cover group-hover:scale-105 transition-transform duration-500" />}
                      </div>
                      <p className="text-white text-xs font-semibold mt-2 line-clamp-2 group-hover:text-violet-300">{a.name}</p>
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {catalog && catalog.albums.length > 0 && (
              <div className="mb-8">
                <h3 className="text-slate-400 text-xs font-bold uppercase tracking-[0.08em] font-display mb-3">Álbumes completos</h3>
                <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x [scrollbar-width:none]">
                  {catalog.albums.map((a) => (
                    <Link key={a.id} href={`/music/album/${a.id}`} className="group shrink-0 w-36 sm:w-40 snap-start">
                      <div className="relative aspect-square rounded-xl overflow-hidden bg-surface-2 border border-white/8">
                        {a.cover && <Image src={a.cover} alt={a.title} fill sizes="160px" className="object-cover group-hover:scale-105 transition-transform duration-500" />}
                      </div>
                      <p className="text-white text-sm font-semibold font-display leading-tight line-clamp-2 mt-2 group-hover:text-violet-300">{a.title}</p>
                      <p className="text-slate-500 text-xs truncate">
                        {a.artist.name}
                        {a.year ? ` · ${a.year}` : ''}
                      </p>
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {isSearchMode && !isPending && videos.length > 0 && (catalog?.artists.length || catalog?.albums.length) ? (
              <h3 className="text-slate-400 text-xs font-bold uppercase tracking-[0.08em] font-display mb-3">Canciones y videos</h3>
            ) : null}

            {isPending ? (
              <GridSkeleton />
            ) : videos.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                {videos.map((video, index) => (
                  <MusicCard key={`${video.id}-${index}`} video={video} allVideos={videos} index={index} />
                ))}
              </div>
            ) : (
              <EmptyState text={`No se encontraron resultados para "${submittedQuery}"`} />
            )}
            {nextPageToken && !isPending && (
              <div className="flex justify-center mt-10">
                <button
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                  className="inline-flex items-center gap-2 bg-surface-1 hover:bg-surface-2 disabled:opacity-50 text-white font-semibold px-8 py-3.5 rounded-full border border-white/8 transition-colors"
                >
                  {isLoadingMore ? <><Loader2 className="w-4 h-4 animate-spin" /> Cargando más...</> : 'Cargar más'}
                </button>
              </div>
            )}
          </section>
        ) : (
          <>
            <FollowedArtistsSection />

            {/* ===== Escuchado recientemente ===== */}
            {hasHydrated && recent.length > 0 && (
              <section className="mb-10">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-white font-bold text-[22px] leading-7">Escuchado recientemente</h2>
                  <Link
                    href="/music/library"
                    className="text-violet-300 hover:text-violet-200 text-xs font-bold uppercase tracking-[0.04em] font-display"
                  >
                    Ver todo
                  </Link>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {recent.map((track, idx) => (
                    <button
                      key={track.id}
                      onClick={() => play(recent, idx)}
                      className="group flex items-center gap-3 bg-surface-2/70 hover:bg-surface-2 border border-white/5 rounded-xl p-2 text-left transition-colors shadow-rim min-w-0"
                    >
                      <div className="relative w-14 h-14 rounded-lg overflow-hidden shrink-0 bg-surface-1">
                        {track.thumbnail && (
                          <Image src={track.thumbnail} alt="" fill sizes="56px" className="object-cover" />
                        )}
                        <TrackStateOverlay id={track.id} size="sm" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-white text-sm font-semibold font-display truncate">
                          {/* "Artista - Canción" → solo la canción; el artista va debajo */}
                          {track.title.replace(/^[^-–]+[-–]\s*/, '') || track.title}
                        </p>
                        <p className="text-slate-400 text-xs truncate mt-0.5">{track.artist || track.channelTitle}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* ===== Hecho para ti ===== */}
            {(forYou || isForYouLoading) && (
              <section className="mb-10">
                <div className="flex items-end justify-between gap-3 mb-4">
                  <div className="min-w-0">
                    <h2 className="text-white font-bold text-[22px] leading-7">Hecho para ti</h2>
                    <p className="text-slate-400 text-sm truncate">
                      {forYouSubtitle ? `Según lo que escuchas: ${forYouSubtitle}` : 'Según lo que escuchas'}
                    </p>
                  </div>
                  <div className="hidden sm:flex gap-2 shrink-0">
                    <button
                      onClick={() => scrollCarousel(-1)}
                      className="w-11 h-11 rounded-full bg-surface-2 border border-white/8 flex items-center justify-center text-slate-300 hover:text-white"
                      aria-label="Anterior"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => scrollCarousel(1)}
                      className="w-11 h-11 rounded-full bg-surface-2 border border-white/8 flex items-center justify-center text-slate-300 hover:text-white"
                      aria-label="Siguiente"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <div
                  ref={carouselRef}
                  className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]"
                >
                  {forYou
                    ? forYou.videos.map((video, index) => (
                        <button
                          key={video.id}
                          onClick={() => play(forYou.videos, index)}
                          className="group relative snap-start shrink-0 w-[78%] sm:w-80 aspect-[16/10] rounded-2xl overflow-hidden bg-surface-2 text-left"
                        >
                          {video.thumbnail && (
                            <Image
                              src={video.thumbnail}
                              alt=""
                              fill
                              sizes="(max-width: 640px) 80vw, 320px"
                              className="object-cover group-hover:scale-105 transition-transform duration-500"
                            />
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                          <TrackStateOverlay id={video.id} />
                          <div className="absolute left-3 right-14 bottom-3">
                            <p className="text-white font-bold font-display text-base leading-tight line-clamp-2">{video.title}</p>
                            <p className="text-slate-300 text-xs truncate mt-1">{video.channelTitle}</p>
                          </div>
                          <span className="absolute right-3 bottom-3 w-10 h-10 rounded-full bg-violet-500 shadow-glow flex items-center justify-center">
                            <Play className="w-4 h-4 text-white fill-white ml-0.5" />
                          </span>
                        </button>
                      ))
                    : Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="shrink-0 w-[78%] sm:w-80 aspect-[16/10] rounded-2xl bg-surface-2 animate-pulse" />
                      ))}
                </div>
              </section>
            )}

            {/* ===== Tendencias ===== */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-5 h-5 text-violet-400" />
                <h2 className="text-white font-bold text-[22px] leading-7">Tendencias</h2>
                <span className="text-slate-500 text-sm">{regionName}</span>
              </div>
              {!trendRegion ? (
                <GridSkeleton />
              ) : videos.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                  {videos.map((video, index) => (
                    <MusicCard key={`${video.id}-${index}`} video={video} allVideos={videos} index={index} />
                  ))}
                </div>
              ) : (
                !error && <EmptyState text="No hay tendencias disponibles" />
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="bg-surface-1 border border-white/8 rounded-xl overflow-hidden animate-pulse">
          <div className="aspect-video bg-surface-2" />
          <div className="p-3 space-y-2">
            <div className="h-3 bg-surface-2 rounded w-full" />
            <div className="h-3 bg-surface-2 rounded w-2/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <Music2 className="w-14 h-14 text-slate-700" />
      <p className="text-slate-500 text-base text-center">{text}</p>
    </div>
  )
}
