'use client'

import { useShallow } from 'zustand/react/shallow'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { readSession, writeSession } from '@/lib/session-cache'
import { Search, Loader2, AlertCircle, Heart, MapPin, LocateFixed, ChevronDown } from 'lucide-react'
import { useMusicStore } from '@/store/musicStore'
import { useLiveStore } from '@/store/liveStore'
import type { RadioStation } from '@/lib/live'
import type { MusicVideo } from '@/lib/youtube-music'
import { LiveHeader, CountrySelect, countryName } from '@/components/LiveTabs'
import { useSearchSuggestions, rememberSearch } from '@/components/SearchSuggestions'

// Una emisora se reproduce con el mismo reproductor que la música (sigue en segundo plano)
function toTrack(s: RadioStation): MusicVideo {
  return {
    id: `radio-${s.id}`,
    title: s.name,
    channelTitle: [countryName(s.countryCode) || s.country, s.tags].filter(Boolean).join(' · '),
    thumbnail: s.favicon || '/icons/icon-192.png',
    publishedAt: '',
    description: '',
    streamUrl: s.url,
  }
}

const selectCls =
  'bg-surface-1 border border-white/8 text-white rounded-full px-4 py-3 text-sm font-semibold focus:outline-none focus:border-violet-500 w-full sm:w-auto min-w-0'
const FAVS_OPEN_KEY = 'cpn-radio-favs-open'

export default function RadioClient() {
  const searchParams = useSearchParams()
  const [country, setCountry] = useState<string>('')
  const [city, setCity] = useState('')
  const [cities, setCities] = useState<{ name: string; count: number }[]>([])
  const [stations, setStations] = useState<RadioStation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [submitted, setSubmitted] = useState(searchParams.get('q') || '')
  const [mounted, setMounted] = useState(false)
  // Favoritas plegadas por defecto (una sola fila); se recuerda si las abres
  const [favsOpen, setFavsOpen] = useState(false)
  useEffect(() => {
    setMounted(true)
    try {
      setFavsOpen(localStorage.getItem(FAVS_OPEN_KEY) === '1')
    } catch {}
  }, [])
  const toggleFavs = () => {
    setFavsOpen((open) => {
      try {
        localStorage.setItem(FAVS_OPEN_KEY, open ? '0' : '1')
      } catch {}
      return !open
    })
  }
  // "Cerca de mí": de dónde salió la ubicación (GPS del teléfono o aproximada por la conexión)
  const [near, setNear] = useState<{ source: 'gps' | 'ip' | 'none'; city?: string } | null>(null)

  const { play, queue, currentIndex, isPlaying, isVisible } = useMusicStore(
    useShallow((s) => ({
      play: s.play,
      queue: s.queue,
      currentIndex: s.currentIndex,
      isPlaying: s.isPlaying,
      isVisible: s.isVisible,
    }))
  )
  const { favoriteRadios, toggleFavoriteRadio } = useLiveStore()
  const current = isVisible ? queue[currentIndex] : undefined
  const countryRef = useRef(country)
  countryRef.current = country

  const router = useRouter()
  const lastUrlRef = useRef<string | null>(null)

  // País, ciudad y búsqueda quedan en la dirección (/radio?country=CL&city=…): al volver se recuperan
  const syncUrl = useCallback(
    (cc: string, q: string, c: string) => {
      const params = new URLSearchParams()
      if (cc) params.set('country', cc)
      if (q) params.set('q', q)
      else if (c) params.set('city', c)
      const next = params.toString()
      lastUrlRef.current = next
      if (next !== window.location.search.replace(/^\?/, '')) router.replace(`/radio${next ? `?${next}` : ''}`, { scroll: false })
    },
    [router]
  )

  const load = useCallback(async (cc: string, q: string, c: string) => {
    setError(null)
    setNear(null)
    // Ya visto en esta sesión: al instante
    const cacheKey = `radio:${cc}:${q.toLowerCase()}:${c}`
    const cached = cc ? readSession<RadioStation[]>(cacheKey) : null
    if (cached) {
      setStations(cached)
      setIsLoading(false)
      syncUrl(cc, q, c)
      return
    }
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (cc) params.set('country', cc)
      if (q) params.set('q', q)
      else if (c) params.set('city', c)
      const res = await fetch(`/api/radio?${params.toString()}`)
      const data = (await res.json()) as { stations?: RadioStation[]; country?: string; error?: string }
      // El país detectado llega incluso si falla la lista, para poder elegir otro
      if (!cc && data.country) setCountry(data.country)
      syncUrl(cc || (data.country && data.country !== 'WORLD' ? data.country : ''), q, c)
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`)
      setStations(data.stations ?? [])
      writeSession(`radio:${cc || data.country || ''}:${q.toLowerCase()}:${c}`, data.stations ?? [])
    } catch (err) {
      setError((err as Error).message)
      setStations([])
    } finally {
      setIsLoading(false)
    }
  }, [syncUrl])

  // Carga según la dirección: primera vez, al volver atrás o búsqueda desde el encabezado
  const urlKey = searchParams.toString()
  useEffect(() => {
    if (urlKey === lastUrlRef.current) return
    const q = searchParams.get('q') || ''
    const c = searchParams.get('city') || ''
    const cc = (searchParams.get('country') || countryRef.current || '').toUpperCase()
    if (cc) setCountry(cc)
    setQuery(q)
    setSubmitted(q)
    setCity(c)
    load(cc, q, c)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlKey, load])

  // Ciudades del país elegido
  useEffect(() => {
    setCities([])
    if (!country || country === 'WORLD') return
    let cancelled = false
    fetch(`/api/radio/cities?country=${country}`)
      .then((r) => (r.ok ? r.json() : { cities: [] }))
      .then((d: { cities: { name: string; count: number }[] }) => !cancelled && setCities(d.cities))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [country])

  const findNearby = async () => {
    setIsLoading(true)
    setError(null)
    setSubmitted('')
    setQuery('')
    setCity('')
    setNear({ source: 'gps' })
    // Pide la ubicación del teléfono; si no hay permiso, el servidor usa la de la conexión
    const coords = await new Promise<GeolocationCoordinates | null>((resolve) => {
      if (!('geolocation' in navigator)) return resolve(null)
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos.coords),
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 10 * 60 * 1000 }
      )
    })
    try {
      const params = new URLSearchParams({ near: '1' })
      if (coords) {
        params.set('lat', coords.latitude.toFixed(4))
        params.set('lon', coords.longitude.toFixed(4))
      }
      const res = await fetch(`/api/radio?${params.toString()}`)
      const data = (await res.json()) as {
        stations?: RadioStation[]
        near?: { source: 'gps' | 'ip' | 'none'; city?: string }
        error?: string
      }
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`)
      setNear(data.near ?? { source: 'none' })
      setStations(data.stations ?? [])
    } catch (err) {
      setError((err as Error).message)
      setStations([])
    } finally {
      setIsLoading(false)
    }
  }

  const changeCountry = (cc: string) => {
    setCountry(cc)
    setCity('')
    setSubmitted('')
    setQuery('')
    load(cc, '', '')
  }

  const changeCity = (c: string) => {
    setCity(c)
    setSubmitted('')
    setQuery('')
    load(country, '', c)
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    rememberSearch('radio', q)
    suggestions.close()
    setSubmitted(q)
    setCity('')
    load(country, q, '')
  }

  // Sugerencias: ciudades del país (al elegir una se filtra por ciudad) y emisoras
  const suggestions = useSearchSuggestions({
    kind: 'radio',
    value: query,
    onChange: setQuery,
    extra: cities.map((c) => c.name),
    onPick: (s) => {
      const isCity = cities.some((c) => c.name === s)
      if (isCity) {
        changeCity(s)
      } else {
        setQuery(s)
        setSubmitted(s)
        setCity('')
        load(country, s, '')
      }
    },
  })

  const tracks = stations.map(toTrack)
  const favIds = new Set(mounted ? favoriteRadios.map((r) => r.id) : [])

  return (
    <div className="pt-20 min-h-screen bg-obsidian pb-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <LiveHeader active="radio" />

        {/* Favoritas (plegables) */}
        {mounted && favoriteRadios.length > 0 && (
          <section className="mb-6 bg-surface-1/60 border border-white/8 rounded-2xl p-3">
            <button
              onClick={toggleFavs}
              className="w-full flex items-center gap-2 text-left"
              aria-expanded={favsOpen}
            >
              <Heart className="w-4 h-4 text-violet-300 fill-violet-300 shrink-0" />
              <span className="text-white font-bold font-display text-base flex-1">
                Mis radios favoritas <span className="text-slate-500 font-normal text-sm">({favoriteRadios.length})</span>
              </span>
              <span className="text-violet-300 text-xs font-semibold">{favsOpen ? 'Ver menos' : 'Ver todas'}</span>
              <ChevronDown className={`w-4 h-4 text-violet-300 transition-transform ${favsOpen ? 'rotate-180' : ''}`} />
            </button>

            {favsOpen ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-3">
                {favoriteRadios.map((track, idx) => (
                  <StationTile
                    key={track.id}
                    track={track}
                    subtitle={track.channelTitle}
                    isCurrent={current?.id === track.id}
                    isPlaying={isPlaying}
                    isFavorite
                    onPlay={() => play(favoriteRadios, idx)}
                    onToggleFavorite={() => toggleFavoriteRadio(track)}
                  />
                ))}
              </div>
            ) : (
              <div className="flex gap-2 overflow-x-auto mt-3 -mx-1 px-1 pb-0.5 [scrollbar-width:none]">
                {favoriteRadios.map((track, idx) => {
                  const isCurrent = current?.id === track.id
                  return (
                    <button
                      key={track.id}
                      onClick={() => play(favoriteRadios, idx)}
                      className={`shrink-0 flex items-center gap-2 max-w-[170px] rounded-full pl-1 pr-3 py-1 border transition-colors ${
                        isCurrent ? 'bg-violet-500/20 border-violet-400/50' : 'bg-surface-2/70 border-white/8'
                      }`}
                    >
                      <StationLogo src={logoOf(track)} name={track.title} size="xs" />
                      <span className={`text-xs font-semibold truncate ${isCurrent ? 'text-emerald-400' : 'text-slate-200'}`}>
                        {track.title}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </section>
        )}

        {/* Cerca de mí */}
        <button
          onClick={findNearby}
          className={`w-full sm:w-auto mb-3 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full text-sm font-bold font-display transition-colors ${
            near
              ? 'bg-emerald-500/15 border border-emerald-400/40 text-emerald-300'
              : 'bg-violet-500 hover:bg-violet-400 text-white shadow-glow'
          }`}
        >
          <LocateFixed className="w-4 h-4" /> Radios cerca de mí
        </button>

        {/* Filtros: país, ciudad y búsqueda */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-6">
          <div className={`grid ${cities.length > 0 ? 'grid-cols-2' : 'grid-cols-1'} gap-2 sm:flex sm:gap-3`}>
          {country && <CountrySelect value={country} onChange={changeCountry} className="w-full sm:w-auto min-w-0" />}
          {cities.length > 0 && (
            <select value={city} onChange={(e) => changeCity(e.target.value)} aria-label="Ciudad o región" className={selectCls}>
              <option value="">📍 Todas las ciudades</option>
              {cities.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.count})
                </option>
              ))}
            </select>
          )}
          </div>
          <form onSubmit={handleSearch} className="relative flex-1" role="search">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar emisora o ciudad..."
              aria-label="Buscar emisora o ciudad"
              enterKeyHint="search"
              className="w-full bg-surface-1 border border-white/8 text-white placeholder-slate-500 rounded-full pl-12 pr-4 py-3 text-base focus:outline-none focus:border-violet-500"
              {...suggestions.inputProps}
            />
            {suggestions.dropdown}
          </form>
        </div>

        <h2 className="flex items-center gap-2 text-white font-bold text-[22px] leading-7 mb-4 min-w-0">
          {near ? (
            <span className="min-w-0">
              <span className="flex items-center gap-2">
                <LocateFixed className="w-5 h-5 text-emerald-400 shrink-0" /> Cerca de ti
              </span>
              {!isLoading && (
                <span className="block text-slate-400 text-sm font-normal font-sans mt-1">
                  {near.source === 'gps'
                    ? 'Según la ubicación de tu teléfono'
                    : near.source === 'ip'
                      ? `Ubicación aproximada según tu conexión${near.city ? ` · ${near.city}` : ''} (activa la ubicación para más precisión)`
                      : 'No pudimos saber tu ubicación. Activa el permiso de ubicación e inténtalo de nuevo.'}
                </span>
              )}
            </span>
          ) : submitted ? (
            <span className="truncate">
              Resultados: <span className="text-violet-300">&ldquo;{submitted}&rdquo;</span>
            </span>
          ) : city ? (
            <>
              <MapPin className="w-5 h-5 text-violet-300 shrink-0" />
              <span className="truncate">{city}</span>
            </>
          ) : (
            <span className="truncate">Emisoras · {countryName(country)}</span>
          )}
        </h2>

        {error && (
          <div className="mb-6 flex items-start gap-3 bg-red-950/40 border border-red-900/50 text-red-400 rounded-xl px-5 py-4 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" /> No se pudieron cargar las emisoras. Intenta de nuevo.
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
          </div>
        ) : stations.length === 0 && !error ? (
          <p className="text-slate-500 text-center py-20">No se encontraron emisoras.</p>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {stations.map((s, idx) => {
              const track = tracks[idx]
              return (
                <StationTile
                  key={s.id}
                  track={track}
                  subtitle={
                    [s.distanceKm !== undefined ? `a ${s.distanceKm < 1 ? 'menos de 1' : s.distanceKm} km` : near && s.city, s.tags, s.codec && `${s.codec}${s.bitrate ? ` ${s.bitrate}k` : ''}`].filter(Boolean).join(' · ') ||
                    countryName(s.countryCode)
                  }
                  isCurrent={current?.id === track.id}
                  isPlaying={isPlaying}
                  isFavorite={favIds.has(track.id)}
                  onPlay={() => play(tracks, idx)}
                  onToggleFavorite={() => toggleFavoriteRadio(track)}
                />
              )
            })}
          </div>
        )}

        <p className="text-slate-600 text-xs mt-8">
          Emisoras de Radio Browser (radio-browser.info), directorio abierto de radios por internet.
        </p>
      </div>
    </div>
  )
}

const logoOf = (track: MusicVideo) => (track.thumbnail.startsWith('/icons/') ? '' : track.thumbnail)

/** Tarjeta compacta de emisora (dos por fila en el celular). */
function StationTile({
  track,
  subtitle,
  isCurrent,
  isPlaying,
  isFavorite,
  onPlay,
  onToggleFavorite,
}: {
  track: MusicVideo
  subtitle: string
  isCurrent: boolean
  isPlaying: boolean
  isFavorite: boolean
  onPlay: () => void
  onToggleFavorite: () => void
}) {
  return (
    <div
      className={`relative rounded-xl border shadow-rim transition-colors ${
        isCurrent ? 'bg-violet-500/15 border-violet-500/40' : 'bg-surface-2/70 hover:bg-surface-2 border-white/5'
      }`}
    >
      <button onClick={onPlay} className="w-full text-left p-2.5">
        <div className="flex items-center gap-2 pr-7">
          <StationLogo src={logoOf(track)} name={track.title} size="sm" />
          {isCurrent && isPlaying && (
            <span className="flex items-end gap-[2px] h-3.5" aria-label="Sonando">
              {[0, 150, 300].map((d) => (
                <span key={d} className="w-[3px] h-full bg-emerald-400 rounded-full origin-bottom animate-eq" style={{ animationDelay: `${d}ms` }} />
              ))}
            </span>
          )}
        </div>
        <p
          className={`text-[13px] leading-4 font-semibold font-display line-clamp-2 mt-2 min-h-[32px] ${
            isCurrent ? 'text-emerald-400' : 'text-white'
          }`}
        >
          {track.title}
        </p>
        <p className="text-slate-400 text-[11px] truncate mt-0.5">{subtitle}</p>
      </button>
      <button
        onClick={onToggleFavorite}
        className={`absolute top-1.5 right-1.5 w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
          isFavorite ? 'text-violet-300' : 'text-slate-500 hover:text-white'
        }`}
        aria-label={isFavorite ? `Quitar ${track.title} de favoritas` : `Agregar ${track.title} a favoritas`}
        aria-pressed={isFavorite}
      >
        <Heart className={`w-4 h-4 ${isFavorite ? 'fill-violet-300' : ''}`} />
      </button>
    </div>
  )
}

function StationLogo({ src, name, size = 'sm' }: { src: string; name: string; size?: 'xs' | 'sm' }) {
  const [failed, setFailed] = useState(false)
  const box = size === 'xs' ? 'w-7 h-7 rounded-full text-[10px]' : 'w-11 h-11 rounded-lg text-sm'
  return (
    <div className={`${box} overflow-hidden shrink-0 bg-surface-1 flex items-center justify-center`}>
      {src && !failed ? (
        // Logos de dominios arbitrarios: <img> directo, sin el optimizador de Next
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className="w-full h-full object-contain p-0.5" />
      ) : (
        <span className="text-violet-300 font-extrabold font-display">{name.slice(0, 2).toUpperCase()}</span>
      )}
    </div>
  )
}
