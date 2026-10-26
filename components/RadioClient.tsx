'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Search, Radio as RadioIcon, Loader2, AlertCircle } from 'lucide-react'
import { useMusicStore } from '@/store/musicStore'
import type { RadioStation } from '@/lib/live'
import type { MusicVideo } from '@/lib/youtube-music'
import { LiveHeader, CountrySelect, countryName } from '@/components/LiveTabs'

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

export default function RadioClient() {
  const searchParams = useSearchParams()
  const [country, setCountry] = useState<string>('')
  const [stations, setStations] = useState<RadioStation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [submitted, setSubmitted] = useState(searchParams.get('q') || '')

  const { play, queue, currentIndex, isPlaying, isVisible } = useMusicStore()
  const current = isVisible ? queue[currentIndex] : undefined

  const load = useCallback(async (cc: string, q: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (cc) params.set('country', cc)
      if (q) params.set('q', q)
      const res = await fetch(`/api/radio?${params.toString()}`)
      const data = (await res.json()) as { stations?: RadioStation[]; country?: string; error?: string }
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`)
      setStations(data.stations ?? [])
      if (!cc && data.country) setCountry(data.country)
    } catch (err) {
      setError((err as Error).message)
      setStations([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Primera carga: país detectado por el servidor (o búsqueda desde el encabezado)
  const urlQuery = searchParams.get('q') || ''
  useEffect(() => {
    setQuery(urlQuery)
    setSubmitted(urlQuery)
    load(country, urlQuery)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQuery, load])

  const changeCountry = (cc: string) => {
    setCountry(cc)
    load(cc, submitted)
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    setSubmitted(q)
    load(country, q)
  }

  const tracks = stations.map(toTrack)

  return (
    <div className="pt-20 min-h-screen bg-obsidian pb-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <LiveHeader active="radio" />

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          {country && <CountrySelect value={country} onChange={changeCountry} />}
          <form onSubmit={handleSearch} className="relative flex-1" role="search">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar emisora..."
              aria-label="Buscar emisora"
              enterKeyHint="search"
              className="w-full bg-surface-1 border border-white/8 text-white placeholder-slate-500 rounded-full pl-12 pr-4 py-3 text-base focus:outline-none focus:border-violet-500"
            />
          </form>
        </div>

        <h2 className="text-white font-bold text-[22px] leading-7 mb-4">
          {submitted ? <>Resultados: <span className="text-violet-300">&ldquo;{submitted}&rdquo;</span></> : <>Emisoras · {countryName(country)}</>}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {stations.map((s, idx) => {
              const isCurrent = current?.id === `radio-${s.id}`
              return (
                <button
                  key={s.id}
                  onClick={() => play(tracks, idx)}
                  className={`group flex items-center gap-3 rounded-xl p-2.5 text-left transition-colors shadow-rim border ${
                    isCurrent ? 'bg-violet-500/15 border-violet-500/40' : 'bg-surface-2/70 hover:bg-surface-2 border-white/5'
                  }`}
                >
                  <StationLogo src={s.favicon} name={s.name} />
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-semibold font-display truncate ${isCurrent ? 'text-emerald-400' : 'text-white'}`}>{s.name}</p>
                    <p className="text-slate-400 text-xs truncate mt-0.5">
                      {[s.tags, s.codec && `${s.codec}${s.bitrate ? ` ${s.bitrate}k` : ''}`].filter(Boolean).join(' · ') || countryName(s.countryCode)}
                    </p>
                  </div>
                  {isCurrent && isPlaying ? (
                    <span className="flex items-end gap-[2px] h-4 shrink-0 pr-1" aria-label="Sonando">
                      {[0, 150, 300].map((d) => (
                        <span key={d} className="w-[3px] h-full bg-emerald-400 rounded-full origin-bottom animate-eq" style={{ animationDelay: `${d}ms` }} />
                      ))}
                    </span>
                  ) : (
                    <RadioIcon className="w-4 h-4 text-slate-600 group-hover:text-violet-300 shrink-0 mr-1" />
                  )}
                </button>
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

function StationLogo({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false)
  return (
    <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 bg-surface-1 flex items-center justify-center">
      {src && !failed ? (
        // Logos de dominios arbitrarios: <img> directo, sin el optimizador de Next
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className="w-full h-full object-contain p-1" />
      ) : (
        <span className="text-violet-300 font-extrabold font-display text-lg">{name.slice(0, 2).toUpperCase()}</span>
      )}
    </div>
  )
}
