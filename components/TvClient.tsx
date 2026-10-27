'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Search, Tv, Loader2, AlertCircle, X, Heart } from 'lucide-react'
import type { TvChannel } from '@/lib/live'
import { useMusicStore } from '@/store/musicStore'
import { useLiveStore } from '@/store/liveStore'
import { LiveHeader, CountrySelect, countryName } from '@/components/LiveTabs'

type ListKind = 'national' | 'spa' | 'news'

export default function TvClient() {
  const searchParams = useSearchParams()
  const [kind, setKind] = useState<ListKind>('national')
  const [country, setCountry] = useState('')
  const [channels, setChannels] = useState<TvChannel[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(false)
  const [filter, setFilter] = useState(searchParams.get('q') || '')
  const [current, setCurrent] = useState<TvChannel | null>(null)
  // Ciudad o región (sale de los propios canales)
  const [place, setPlace] = useState('')
  const { favoriteChannels, toggleFavoriteChannel } = useLiveStore()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  useEffect(() => setPlace(''), [country, kind])

  useEffect(() => {
    setFilter(searchParams.get('q') || '')
  }, [searchParams])

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(false)
    const list = kind === 'national' ? country.toLowerCase() : kind
    fetch(`/api/tv${list ? `?list=${list}` : ''}`)
      .then(async (r) => ({ ok: r.ok, data: (await r.json()) as { channels: TvChannel[]; list?: string } }))
      .then(({ ok, data }) => {
        if (cancelled) return
        // El país detectado llega incluso si falla la lista, para poder elegir otro
        if (kind === 'national' && !country && data.list && /^[a-z]{2}$/.test(data.list)) setCountry(data.list.toUpperCase())
        if (!ok) throw new Error('lista no disponible')
        setChannels(data.channels)
      })
      .catch(() => !cancelled && (setError(true), setChannels([])))
      .finally(() => !cancelled && setIsLoading(false))
    return () => {
      cancelled = true
    }
  }, [kind, country])

  // Ciudades/regiones con canales locales (de más a menos canales)
  const places = useMemo(() => {
    const count = new Map<string, number>()
    for (const c of channels) {
      const p = c.city || c.region
      if (p) count.set(p, (count.get(p) ?? 0) + 1)
    }
    return Array.from(count, ([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'es'))
  }, [channels])

  const visible = useMemo(() => {
    const f = filter.trim().toLowerCase()
    const byPlace = place
      ? channels.filter((c) => (place === '__national' ? !c.city && !c.region : c.city === place || c.region === place))
      : channels
    return f
      ? byPlace.filter((c) => `${c.name} ${c.group} ${c.city ?? ''} ${c.region ?? ''}`.toLowerCase().includes(f))
      : byPlace
  }, [channels, filter, place])

  const select = (c: TvChannel) => {
    setCurrent(c)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const chip = 'shrink-0 px-4 py-2 rounded-full text-sm font-semibold font-display transition-colors'
  const chipCls = (on: boolean) =>
    `${chip} ${on ? 'bg-violet-500 text-white shadow-glow' : 'bg-surface-2/60 border border-white/8 text-slate-300 hover:text-white'}`

  return (
    <div className="pt-20 min-h-screen bg-obsidian pb-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <LiveHeader active="tv" />

        {current && (
          <TvPlayer
            channel={current}
            onClose={() => setCurrent(null)}
            isFavorite={mounted && favoriteChannels.some((c) => c.url === current.url)}
            onToggleFavorite={() => toggleFavoriteChannel(current)}
          />
        )}

        {mounted && favoriteChannels.length > 0 && (
          <section className="mb-8">
            <h2 className="flex items-center gap-2 text-white font-bold text-[22px] leading-7 mb-4">
              <Heart className="w-5 h-5 text-violet-300 fill-violet-300" /> Mis canales favoritos
            </h2>
            <ChannelGrid
              channels={favoriteChannels}
              currentUrl={current?.url}
              favoriteUrls={new Set(favoriteChannels.map((c) => c.url))}
              onSelect={select}
              onToggleFavorite={toggleFavoriteChannel}
            />
          </section>
        )}

        <div className="flex gap-2 overflow-x-auto pb-1 mb-4 -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">
          <button onClick={() => setKind('national')} className={chipCls(kind === 'national')}>
            Nacional{country ? ` · ${countryName(country)}` : ''}
          </button>
          <button onClick={() => setKind('spa')} className={chipCls(kind === 'spa')}>
            Internacional en español
          </button>
          <button onClick={() => setKind('news')} className={chipCls(kind === 'news')}>
            Noticias del mundo
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          {kind === 'national' && country && (
            <CountrySelect value={country} onChange={setCountry} includeWorld={false} />
          )}
          {kind === 'national' && places.length > 0 && (
            <select
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              aria-label="Ciudad"
              className="bg-surface-1 border border-white/8 text-white rounded-full px-4 py-3 text-sm font-semibold focus:outline-none focus:border-violet-500 max-w-full"
            >
              <option value="">📍 Todo el país ({channels.length})</option>
              <option value="__national">📺 Canales nacionales</option>
              {places.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name} ({p.n})
                </option>
              ))}
            </select>
          )}
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Buscar canal o ciudad..."
              aria-label="Buscar canal o ciudad"
              className="w-full bg-surface-1 border border-white/8 text-white placeholder-slate-500 rounded-full pl-12 pr-4 py-3 text-base focus:outline-none focus:border-violet-500"
            />
          </div>
        </div>

        {error && (
          <div className="mb-6 flex items-start gap-3 bg-red-950/40 border border-red-900/50 text-red-400 rounded-xl px-5 py-4 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" /> No se pudieron cargar los canales. Intenta de nuevo.
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
          </div>
        ) : visible.length === 0 && !error ? (
          <p className="text-slate-500 text-center py-20">No hay canales disponibles en esta lista.</p>
        ) : (
          <ChannelGrid
            channels={visible}
            currentUrl={current?.url}
            favoriteUrls={new Set(mounted ? favoriteChannels.map((c) => c.url) : [])}
            onSelect={select}
            onToggleFavorite={toggleFavoriteChannel}
          />
        )}

        <p className="text-slate-600 text-xs mt-8">
          Canales de acceso libre por internet según iptv-org. La disponibilidad depende de cada canal y algunos solo
          funcionan en su país.
        </p>
      </div>
    </div>
  )
}

function ChannelGrid({
  channels,
  currentUrl,
  favoriteUrls,
  onSelect,
  onToggleFavorite,
}: {
  channels: TvChannel[]
  currentUrl?: string
  favoriteUrls: Set<string>
  onSelect: (c: TvChannel) => void
  onToggleFavorite: (c: TvChannel) => void
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {channels.map((c) => {
        const isCurrent = currentUrl === c.url
        const isFav = favoriteUrls.has(c.url)
        return (
          <div
            key={c.url}
            className={`relative rounded-xl overflow-hidden border transition-colors shadow-rim ${
              isCurrent ? 'bg-violet-500/15 border-violet-500/50' : 'bg-surface-1 border-white/8 hover:border-violet-500/40'
            }`}
          >
            <button onClick={() => onSelect(c)} className="block w-full text-left">
              <div className="aspect-video bg-surface-2 flex items-center justify-center p-4">
                <ChannelLogo src={c.logo} name={c.name} />
              </div>
              <div className="p-2.5 pr-10">
                <p className={`text-sm font-semibold font-display truncate ${isCurrent ? 'text-emerald-400' : 'text-white'}`}>{c.name}</p>
                <p className="text-slate-500 text-xs truncate">{[c.city || c.region, c.group].filter(Boolean).join(' · ') || 'General'}</p>
              </div>
            </button>
            <button
              onClick={() => onToggleFavorite(c)}
              className={`absolute right-1 bottom-1.5 w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                isFav ? 'text-violet-300' : 'text-slate-500 hover:text-white'
              }`}
              aria-label={isFav ? `Quitar ${c.name} de favoritos` : `Agregar ${c.name} a favoritos`}
              aria-pressed={isFav}
            >
              <Heart className={`w-4 h-4 ${isFav ? 'fill-violet-300' : ''}`} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

function ChannelLogo({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <span className="flex flex-col items-center gap-1 text-slate-500">
        <Tv className="w-8 h-8" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-center line-clamp-1">{name}</span>
      </span>
    )
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={name} loading="lazy" onError={() => setFailed(true)} className="max-w-full max-h-full object-contain" />
}

/** Reproductor HLS: hls.js donde hay Media Source (Android, PC) y nativo en iPhone. */
function TvPlayer({
  channel,
  onClose,
  isFavorite,
  onToggleFavorite,
}: {
  channel: TvChannel
  onClose: () => void
  isFavorite: boolean
  onToggleFavorite: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<'loading' | 'playing' | 'error'>('loading')
  // Primero la dirección directa; si falla (CORS, corte), la del intermediario
  const [src, setSrc] = useState(channel.url)
  useEffect(() => setSrc(channel.url), [channel.url])
  const failed = useCallback(() => {
    if (channel.fallbackUrl && src !== channel.fallbackUrl) setSrc(channel.fallbackUrl)
    else setStatus('error')
  }, [channel.fallbackUrl, src])
  const failedRef = useRef(failed)
  failedRef.current = failed

  useEffect(() => {
    // La TV y la música no suenan a la vez
    useMusicStore.getState().setIsPlaying(false)

    const video = videoRef.current
    if (!video) return
    let destroyed = false
    let hls: { destroy: () => void } | null = null
    setStatus('loading')

    const onPlaying = () => setStatus('playing')
    const onError = () => failedRef.current()
    video.addEventListener('playing', onPlaying)
    video.addEventListener('error', onError)

    import('hls.js').then(({ default: Hls }) => {
      if (destroyed) return
      if (Hls.isSupported()) {
        const instance = new Hls({ enableWorker: true, lowLatencyMode: true })
        hls = instance
        instance.on(Hls.Events.ERROR, (_e, data) => {
          if (data.fatal) failedRef.current()
        })
        instance.loadSource(src)
        instance.attachMedia(video)
      } else {
        video.src = src
      }
      video.play().catch(() => {})
    })

    return () => {
      destroyed = true
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('error', onError)
      hls?.destroy()
      video.removeAttribute('src')
      video.load()
    }
  }, [src])

  return (
    <div className="sticky top-16 z-30 -mx-4 sm:mx-0 mb-5 bg-obsidian">
      <div className="relative aspect-video bg-black sm:rounded-2xl overflow-hidden border-y sm:border border-white/10">
        <video ref={videoRef} controls playsInline autoPlay className="w-full h-full" />
        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Loader2 className="w-10 h-10 text-violet-300 animate-spin" />
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 text-center px-6">
            <AlertCircle className="w-8 h-8 text-red-400" />
            <p className="text-white font-semibold">Este canal no está disponible ahora</p>
            <p className="text-slate-400 text-sm">Puede estar fuera del aire o solo emitir en su país. Prueba con otro.</p>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 px-4 sm:px-1 py-2.5">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-emerald-400 text-[10px] font-bold uppercase tracking-[0.08em] font-display">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> En vivo
          </p>
          <p className="text-white font-bold font-display truncate">{channel.name}</p>
        </div>
        <button
          onClick={onToggleFavorite}
          className={`shrink-0 ml-auto w-10 h-10 rounded-full bg-surface-2 border border-white/8 flex items-center justify-center ${
            isFavorite ? 'text-violet-300' : 'text-slate-300'
          }`}
          aria-label={isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
          aria-pressed={isFavorite}
        >
          <Heart className={`w-5 h-5 ${isFavorite ? 'fill-violet-300' : ''}`} />
        </button>
        <button
          onClick={onClose}
          className="shrink-0 w-10 h-10 rounded-full bg-surface-2 border border-white/8 flex items-center justify-center text-slate-300"
          aria-label="Cerrar canal"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}
