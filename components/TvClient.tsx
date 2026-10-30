'use client'

import { forwardRef, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Search, Tv, Loader2, AlertCircle, X, Heart, ChevronUp, ChevronDown, Maximize, Minimize, Cast } from 'lucide-react'
import CastButton, { useIsCasting, useCastStore } from '@/components/CastButton'
import HlsQualityMenu, { levelFor, readQualityPref, type QualityPref } from '@/components/HlsQuality'
import type { TvChannel } from '@/lib/live'
import { useMusicStore } from '@/store/musicStore'
import { useLiveStore } from '@/store/liveStore'
import { LiveHeader, CountrySelect, countryName } from '@/components/LiveTabs'
import { readSession, writeSession } from '@/lib/session-cache'

type ListKind = 'national' | 'pluto' | 'spa' | 'news'
interface TvState {
  kind: ListKind
  country: string
  place: string
}

// Lista, país y ciudad elegidos se recuerdan en la sesión: al volver a TV se ve lo mismo
// (y en la misma posición), sin volver a cargar.
const STATE_KEY = 'tv-state'
const listKey = (list: string) => `tv-list:${list}`
const savedState = () => (typeof window === 'undefined' ? null : readSession<TvState>(STATE_KEY))

export default function TvClient() {
  const searchParams = useSearchParams()
  const [kind, setKind] = useState<ListKind>(() => savedState()?.kind ?? 'national')
  const [country, setCountry] = useState(() => savedState()?.country ?? '')
  const [channels, setChannels] = useState<TvChannel[]>(() => {
    const st = savedState()
    const list = st && (st.kind === 'national' ? st.country.toLowerCase() : st.kind)
    return (list && list !== 'pluto' && readSession<TvChannel[]>(listKey(list))) || []
  })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(false)
  const [filter, setFilter] = useState(searchParams.get('q') || '')
  const [current, setCurrent] = useState<TvChannel | null>(null)
  // Ciudad o región (sale de los propios canales)
  const [place, setPlace] = useState(() => savedState()?.place ?? '')
  const { favoriteChannels, toggleFavoriteChannel } = useLiveStore()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Al cambiar de país o de lista se vuelve a "todo el país" (no al abrir la pantalla)
  const listRef = useRef(`${kind}:${country}`)
  useEffect(() => {
    if (listRef.current === `${kind}:${country}`) return
    listRef.current = `${kind}:${country}`
    setPlace('')
  }, [country, kind])

  useEffect(() => {
    if (country || kind !== 'national') writeSession<TvState>(STATE_KEY, { kind, country, place })
  }, [kind, country, place])

  useEffect(() => {
    setFilter(searchParams.get('q') || '')
  }, [searchParams])

  useEffect(() => {
    let cancelled = false
    setError(false)
    const list = kind === 'national' ? country.toLowerCase() : kind
    const cached = list && list !== 'pluto' ? readSession<TvChannel[]>(listKey(list)) : null
    if (cached) {
      setChannels(cached)
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    fetch(`/api/tv${list ? `?list=${list}` : ''}`)
      .then(async (r) => ({ ok: r.ok, data: (await r.json()) as { channels: TvChannel[]; list?: string } }))
      .then(({ ok, data }) => {
        if (cancelled) return
        // El país detectado llega incluso si falla la lista, para poder elegir otro
        if (kind === 'national' && !country && data.list && /^[a-z]{2}$/.test(data.list)) setCountry(data.list.toUpperCase())
        if (!ok) throw new Error('lista no disponible')
        setChannels(data.channels)
        if (data.list && data.list !== 'pluto' && data.channels.length > 0) writeSession(listKey(data.list), data.channels)
      })
      .catch(() => !cancelled && (setError(true), setChannels([])))
      .finally(() => !cancelled && setIsLoading(false))
    return () => {
      cancelled = true
    }
  }, [kind, country])

  // Nacional: ciudades/regiones con canales locales. Otras listas: categorías.
  const byCategory = kind !== 'national'
  const places = useMemo(() => {
    const count = new Map<string, number>()
    for (const c of channels) {
      const p = byCategory ? c.group : c.city || c.region
      if (p) count.set(p, (count.get(p) ?? 0) + 1)
    }
    return Array.from(count, ([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'es'))
  }, [channels, byCategory])

  // Canales que no cargaron en este teléfono: se marcan "Sin señal" y, la próxima vez que
  // se abra la lista, quedan al final (no se mueven mientras uno está mirando)
  const [unavailable, setUnavailable] = useState<Set<string>>(
    () => new Set(typeof window === 'undefined' ? [] : readSession<string[]>('tv-unavailable') ?? [])
  )
  const markUnavailable = useCallback((c: TvChannel, off = true) => {
    setUnavailable((prev) => {
      if (prev.has(c.url) === off) return prev
      const next = new Set(prev)
      if (off) next.add(c.url)
      else next.delete(c.url)
      writeSession('tv-unavailable', Array.from(next).slice(-500))
      return next
    })
  }, [])
  const unavailableRef = useRef(unavailable)
  unavailableRef.current = unavailable
  const ordered = useMemo(() => {
    const off = unavailableRef.current
    return off.size ? [...channels.filter((c) => !off.has(c.url)), ...channels.filter((c) => off.has(c.url))] : channels
  }, [channels])

  const visible = useMemo(() => {
    const f = filter.trim().toLowerCase()
    const byPlace = place
      ? ordered.filter((c) =>
          byCategory ? c.group === place : place === '__national' ? !c.city && !c.region : c.city === place || c.region === place
        )
      : ordered
    return f
      ? byPlace.filter((c) => `${c.name} ${c.group} ${c.city ?? ''} ${c.region ?? ''}`.toLowerCase().includes(f))
      : byPlace
  }, [ordered, filter, place, byCategory])

  // Al abrir o cerrar el reproductor (que ocupa espacio arriba) la pantalla no salta:
  // el canal tocado queda donde estaba, o justo debajo del reproductor si este lo tapa.
  const anchorRef = useRef<{ el: HTMLElement; top: number } | null>(null)
  const playerRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const anchor = anchorRef.current
    anchorRef.current = null
    if (!anchor || !anchor.el.isConnected) return
    window.scrollBy(0, anchor.el.getBoundingClientRect().top - anchor.top)
    const playerBottom = playerRef.current?.getBoundingClientRect().bottom ?? 0
    const top = anchor.el.getBoundingClientRect().top
    if (top < playerBottom + 8) window.scrollBy(0, top - playerBottom - 8)
  }, [current])

  const select = (c: TvChannel, el?: HTMLElement) => {
    if (el) anchorRef.current = { el, top: el.getBoundingClientRect().top }
    setCurrent(c)
  }

  // Control remoto: los canales se recorren en el orden de la lista que se está viendo
  // (o de los favoritos, si el canal se eligió desde ahí)
  const zapList = useMemo(() => {
    if (!current) return visible
    const inVisible = visible.some((c) => c.url === current.url)
    const inFavorites = mounted && favoriteChannels.some((c) => c.url === current.url)
    return !inVisible && inFavorites ? favoriteChannels : visible
  }, [current, visible, favoriteChannels, mounted])
  const zapIndex = current ? zapList.findIndex((c) => c.url === current.url) : -1
  const zap = useCallback(
    (step: number) => {
      if (zapList.length === 0) return
      const i = zapIndex < 0 ? 0 : (zapIndex + step + zapList.length) % zapList.length
      setCurrent(zapList[i])
    },
    [zapList, zapIndex]
  )
  const tune = useCallback(
    (n: number) => {
      const c = zapList[n - 1]
      if (c) setCurrent(c)
      return !!c
    },
    [zapList]
  )

  const close = () => {
    // Se fija el primer canal visible para que la lista no se mueva al quitar el reproductor
    const playerBottom = playerRef.current?.getBoundingClientRect().bottom ?? 0
    const el = Array.from(document.querySelectorAll<HTMLElement>('[data-tv-card]')).find(
      (e) => e.getBoundingClientRect().top >= playerBottom
    )
    if (el) anchorRef.current = { el, top: el.getBoundingClientRect().top }
    setCurrent(null)
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
            ref={playerRef}
            channel={current}
            number={zapIndex + 1}
            total={zapList.length}
            onZap={zap}
            onTune={tune}
            onClose={close}
            isFavorite={mounted && favoriteChannels.some((c) => c.url === current.url)}
            onToggleFavorite={() => toggleFavoriteChannel(current)}
            onUnavailable={markUnavailable}
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
              unavailableUrls={unavailable}
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
          <button onClick={() => setKind('pluto')} className={chipCls(kind === 'pluto')}>
            Pluto TV
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
          {places.length > (byCategory ? 1 : 0) && (
            <select
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              aria-label={byCategory ? 'Categoría' : 'Ciudad'}
              className="bg-surface-1 border border-white/8 text-white rounded-full px-4 py-3 text-sm font-semibold focus:outline-none focus:border-violet-500 max-w-full"
            >
              {byCategory ? (
                <option value="">🎬 Todas las categorías ({channels.length})</option>
              ) : (
                <>
                  <option value="">📍 Todo el país ({channels.length})</option>
                  <option value="__national">📺 Canales nacionales</option>
                </>
              )}
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

        {isLoading && channels.length === 0 ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
          </div>
        ) : visible.length === 0 && !error ? (
          <p className="text-slate-500 text-center py-20">No hay canales disponibles en esta lista.</p>
        ) : (
          <ChannelGrid
            channels={visible}
            currentUrl={current?.url}
            unavailableUrls={unavailable}
            numbered
            favoriteUrls={new Set(mounted ? favoriteChannels.map((c) => c.url) : [])}
            onSelect={select}
            onToggleFavorite={toggleFavoriteChannel}
          />
        )}

        <p className="text-slate-600 text-xs mt-8">
          Canales de acceso libre por internet (iptv-org, Free-TV y Pluto TV). La disponibilidad depende de cada canal y
          algunos solo funcionan en su país.
        </p>
      </div>
    </div>
  )
}

function ChannelGrid({
  channels,
  currentUrl,
  favoriteUrls,
  unavailableUrls,
  numbered = false,
  onSelect,
  onToggleFavorite,
}: {
  channels: TvChannel[]
  currentUrl?: string
  favoriteUrls: Set<string>
  unavailableUrls: Set<string>
  numbered?: boolean
  onSelect: (c: TvChannel, el?: HTMLElement) => void
  onToggleFavorite: (c: TvChannel) => void
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {channels.map((c, i) => {
        const isCurrent = currentUrl === c.url
        const isFav = favoriteUrls.has(c.url)
        const isOff = unavailableUrls.has(c.url) && !isCurrent
        return (
          <div
            key={c.url}
            data-tv-card
            className={`relative rounded-xl overflow-hidden border transition-colors shadow-rim ${
              isCurrent ? 'bg-violet-500/15 border-violet-500/50' : 'bg-surface-1 border-white/8 hover:border-violet-500/40'
            }`}
          >
            <button onClick={(e) => onSelect(c, e.currentTarget)} className="block w-full text-left">
              <div className={`relative aspect-video bg-surface-2 flex items-center justify-center p-4 ${isOff ? 'opacity-40' : ''}`}>
                <ChannelLogo src={c.logo} name={c.name} />
              </div>
              {numbered && (
                <span className="absolute top-1.5 right-1.5 min-w-[1.75rem] px-1.5 py-0.5 rounded-md bg-black/60 text-slate-200 text-[11px] font-bold text-center tabular-nums">
                  {i + 1}
                </span>
              )}
              {isOff && (
                <span className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-full bg-black/70 text-slate-300 text-[10px] font-bold uppercase tracking-wider">
                  Sin señal
                </span>
              )}
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
const TvPlayer = forwardRef<
  HTMLDivElement,
  {
    channel: TvChannel
    onClose: () => void
    isFavorite: boolean
    onToggleFavorite: () => void
    onUnavailable?: (c: TvChannel, off?: boolean) => void
    number: number
    total: number
    onZap: (step: number) => void
    onTune: (n: number) => boolean
  }
>(function TvPlayer({ channel, onClose, isFavorite, onToggleFavorite, onUnavailable, number, total, onZap, onTune }, ref) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<'loading' | 'playing' | 'error'>('loading')
  // Primero la dirección directa; si no arranca (CORS, corte), la del intermediario
  const [src, setSrc] = useState(channel.url)
  // Sube con "Reintentar" para volver a cargar el canal desde cero
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    setSrc(channel.url)
    setAttempt(0)
  }, [channel.url])
  const failed = useCallback(() => {
    if (channel.fallbackUrl && src !== channel.fallbackUrl) setSrc(channel.fallbackUrl)
    else {
      setStatus('error')
      onUnavailable?.(channel)
    }
  }, [channel, src, onUnavailable])
  const failedRef = useRef(failed)
  failedRef.current = failed
  // Calidad de video (se recuerda entre canales)
  const hlsRef = useRef<import('hls.js').default | null>(null)
  const [levels, setLevels] = useState<{ height?: number }[]>([])
  const [quality, setQuality] = useState<QualityPref>('max')
  const qualityRef = useRef<QualityPref>('max')
  useEffect(() => {
    const q = readQualityPref()
    qualityRef.current = q
    setQuality(q)
  }, [])
  const changeQuality = (q: QualityPref) => {
    qualityRef.current = q
    setQuality(q)
    const h = hlsRef.current
    if (!h) return
    h.capLevelToPlayerSize = q === 'auto'
    h.currentLevel = levelFor(q, h.levels)
  }
  // Mientras se ve en la TV, el teléfono no reproduce el canal (solo hace de control remoto)
  const casting = useIsCasting()
  const castDevice = useCastStore((s) => s.device)
  const workingRef = useRef(() => onUnavailable?.(channel, false))
  workingRef.current = () => onUnavailable?.(channel, false)

  useEffect(() => {
    // La TV y la música no suenan a la vez
    useMusicStore.getState().setIsPlaying(false)

    const video = videoRef.current
    if (!video || casting) return
    let destroyed = false
    let started = false
    let hls: import('hls.js').default | null = null
    let stallTimer: ReturnType<typeof setTimeout> | undefined
    setStatus('loading')

    const onPlaying = () => {
      started = true
      clearTimeout(stallTimer)
      setStatus('playing')
      workingRef.current()
    }
    // Si se queda "pensando" mucho rato, se vuelve a pedir la señal y se salta al punto en vivo
    const onWaiting = () => {
      clearTimeout(stallTimer)
      stallTimer = setTimeout(() => {
        if (destroyed) return
        if (hls) {
          hls.startLoad()
          if (hls.liveSyncPosition) video.currentTime = hls.liveSyncPosition
        } else {
          video.load()
        }
        video.play().catch(() => {})
      }, 8000)
    }
    // Algunos canales entregan la emisión por tramos: al terminar uno se pide el siguiente
    const onEnded = () => {
      if (destroyed) return
      if (hls) {
        hls.stopLoad()
        hls.loadSource(src)
      } else {
        video.load()
      }
      video.play().catch(() => {})
    }
    video.addEventListener('playing', onPlaying)
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('stalled', onWaiting)
    video.addEventListener('ended', onEnded)

    import('hls.js').then(({ default: Hls }) => {
      if (destroyed) return
      if (Hls.isSupported()) {
        const instance = new Hls({
          enableWorker: true,
          // El modo de baja latencia hace que los canales normales se detengan a cada rato
          lowLatencyMode: false,
          // Más colchón: unos segundos detrás del vivo, pero sin cortes
          liveSyncDurationCount: 4,
          liveMaxLatencyDurationCount: 12,
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          backBufferLength: 30,
          // Calidad: la elegida (por defecto la más alta); en "Automática", según pantalla y conexión
          capLevelToPlayerSize: qualityRef.current === 'auto',
          startLevel: -1,
          // Reintentos ante una red inestable
          manifestLoadingMaxRetry: 3,
          levelLoadingMaxRetry: 6,
          fragLoadingMaxRetry: 6,
          fragLoadingRetryDelay: 1000,
          nudgeMaxRetry: 10,
        })
        hls = instance
        hlsRef.current = instance
        instance.on(Hls.Events.MANIFEST_PARSED, () => {
          setLevels(instance.levels.map((l) => ({ height: l.height })))
          const lvl = levelFor(qualityRef.current, instance.levels)
          if (lvl >= 0) instance.currentLevel = lvl
        })
        let networkRetries = 0
        let mediaRecoveries = 0
        instance.on(Hls.Events.FRAG_LOADED, () => {
          networkRetries = 0
        })
        instance.on(Hls.Events.ERROR, (_e, data) => {
          if (!data.fatal || destroyed) return
          // Si nunca arrancó, se prueba la otra dirección; si ya se veía, se intenta recuperar
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR && started && networkRetries < 5) {
            networkRetries++
            setTimeout(() => !destroyed && instance.startLoad(), 1000 * networkRetries)
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveries < 2) {
            if (mediaRecoveries++ === 1) instance.swapAudioCodec()
            instance.recoverMediaError()
          } else {
            failedRef.current()
          }
        })
        instance.loadSource(src)
        instance.attachMedia(video)
      } else {
        // iPhone: reproductor nativo
        video.addEventListener('error', () => !destroyed && failedRef.current(), { once: true })
        video.src = src
      }
      video.play().catch(() => {})
    })

    return () => {
      destroyed = true
      clearTimeout(stallTimer)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('stalled', onWaiting)
      video.removeEventListener('ended', onEnded)
      hls?.destroy()
      hlsRef.current = null
      setLevels([])
      video.removeAttribute('src')
      video.load()
    }
  }, [src, attempt, casting])

  // ===== Control remoto =====
  // Cartel con número y nombre al cambiar de canal (como en la TV)
  const [osd, setOsd] = useState<string | null>(null)
  const osdTimer = useRef<ReturnType<typeof setTimeout>>()
  const showOsd = useCallback((text: string, ms = 2500) => {
    setOsd(text)
    clearTimeout(osdTimer.current)
    osdTimer.current = setTimeout(() => setOsd(null), ms)
  }, [])
  useEffect(() => {
    if (number > 0) showOsd(`${number} · ${channel.name}`)
  }, [channel.url, number, channel.name, showOsd])

  const zapRef = useRef(onZap)
  zapRef.current = onZap
  const tuneRef = useRef(onTune)
  tuneRef.current = onTune

  // Teclado y controles de TV/PC: ▲▼, Página arriba/abajo, CH+/CH−, y números para ir a un canal
  useEffect(() => {
    let digits = ''
    let digitTimer: ReturnType<typeof setTimeout> | undefined
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'ChannelUp') {
        e.preventDefault()
        zapRef.current(1)
      } else if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 'ChannelDown') {
        e.preventDefault()
        zapRef.current(-1)
      } else if (/^[0-9]$/.test(e.key)) {
        digits = (digits + e.key).slice(-4)
        showOsd(`${digits}_`, 2000)
        clearTimeout(digitTimer)
        digitTimer = setTimeout(() => {
          const n = Number(digits)
          digits = ''
          if (!tuneRef.current(n)) showOsd(`Canal ${n} no existe`, 1500)
        }, 1200)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      clearTimeout(digitTimer)
    }
  }, [showOsd])

  // Botones del auricular / pantalla de bloqueo: anterior y siguiente cambian de canal
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: channel.name,
        artist: 'TV en vivo · Carlos P. Nauto Interactive',
        artwork: channel.logo ? [{ src: channel.logo, sizes: '512x512' }] : [],
      })
      navigator.mediaSession.setActionHandler('nexttrack', () => zapRef.current(1))
      navigator.mediaSession.setActionHandler('previoustrack', () => zapRef.current(-1))
    } catch {}
    return () => {
      try {
        navigator.mediaSession.setActionHandler('nexttrack', null)
        navigator.mediaSession.setActionHandler('previoustrack', null)
      } catch {}
    }
  }, [channel.name, channel.logo])

  // ===== Pantalla completa con los controles de canal encima =====
  // Se pone en pantalla completa el recuadro (no solo el video) para que se vean CH▲▼.
  // En iPhone, donde eso no se puede, se ocupa toda la pantalla con la página.
  const boxRef = useRef<HTMLDivElement>(null)
  const [full, setFull] = useState(false)
  const [ui, setUi] = useState(true)
  const uiTimer = useRef<ReturnType<typeof setTimeout>>()
  const pokeUi = useCallback(() => {
    setUi(true)
    clearTimeout(uiTimer.current)
    uiTimer.current = setTimeout(() => setUi(false), 3500)
  }, [])
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setFull(false)
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  useEffect(() => {
    if (!full) return
    pokeUi()
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [full, pokeUi])
  const enterFull = async () => {
    setFull(true)
    try {
      await boxRef.current?.requestFullscreen?.({ navigationUI: 'hide' })
      // Android: girar a horizontal
      await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape')
    } catch {}
  }
  const exitFull = () => {
    setFull(false)
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    try {
      screen.orientation?.unlock?.()
    } catch {}
  }
  // En pantalla completa: deslizar arriba/abajo cambia de canal
  const touchY = useRef<number | null>(null)

  // Deslizar el dedo a la izquierda/derecha sobre la barra del canal: siguiente/anterior
  const touchX = useRef<number | null>(null)

  return (
    <div ref={ref} className={`sticky top-16 ${full ? 'z-[150]' : 'z-30'} -mx-4 sm:mx-0 mb-5 bg-obsidian`}>
      <div
        ref={boxRef}
        data-cpn-video=""
        className={
          full
            ? 'fixed inset-0 z-[150] bg-black flex items-center justify-center'
            : 'relative aspect-video bg-black sm:rounded-2xl overflow-hidden border-y sm:border border-white/10'
        }
        onPointerDownCapture={full ? pokeUi : undefined}
        onTouchStart={full ? (e) => (touchY.current = e.touches[0].clientY) : undefined}
        onTouchEnd={
          full
            ? (e) => {
                const start = touchY.current
                touchY.current = null
                if (start === null) return
                const dy = e.changedTouches[0].clientY - start
                if (Math.abs(dy) > 80) onZap(dy < 0 ? 1 : -1)
              }
            : undefined
        }
      >
        <video
          ref={videoRef}
          controls
          // La pantalla completa la maneja la app (para mostrar los botones de canal)
          controlsList="nofullscreen"
          playsInline
          autoPlay
          className={`w-full h-full ${casting ? 'invisible' : ''}`}
        />
        {casting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-violet-950 to-black text-center px-6">
            <Cast className="w-10 h-10 text-emerald-400" />
            <p className="text-white font-semibold">Viendo en {castDevice || 'la TV'}</p>
            <p className="text-slate-400 text-sm">Usa CH ▲▼ para cambiar de canal en la TV.</p>
          </div>
        )}
        {/* Calidad del video */}
        {!casting && levels.length > 0 && (
          <HlsQualityMenu levels={levels} pref={quality} onChange={changeQuality} className={`absolute z-20 ${full ? 'top-16 left-4' : 'top-2 left-12'}`} />
        )}
        {/* Botón de pantalla completa (arriba a la izquierda, sobre el video) */}
        {!full && (
          <button
            onClick={enterFull}
            className="absolute z-10 top-2 left-2 w-9 h-9 rounded-full bg-black/55 backdrop-blur flex items-center justify-center text-white"
            aria-label="Pantalla completa"
          >
            <Maximize className="w-4 h-4" />
          </button>
        )}
        {full && (
          <div className={`absolute inset-0 z-20 pointer-events-none transition-opacity duration-300 ${ui ? 'opacity-100' : 'opacity-0'}`}>
            <div className="absolute top-0 inset-x-0 flex items-center gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-6 bg-gradient-to-b from-black/80 to-transparent">
              <div className="min-w-0 flex-1">
                <p className="text-emerald-400 text-[10px] font-bold uppercase tracking-[0.08em] font-display">
                  En vivo{number > 0 ? ` · Canal ${number} de ${total}` : ''}
                </p>
                <p className="text-white font-bold font-display text-lg truncate">{channel.name}</p>
              </div>
              <button
                onClick={exitFull}
                className={`${ui ? 'pointer-events-auto' : ''} shrink-0 w-11 h-11 rounded-full bg-white/15 backdrop-blur flex items-center justify-center text-white`}
                aria-label="Salir de pantalla completa"
              >
                <Minimize className="w-5 h-5" />
              </button>
            </div>
            <div
              className={`${ui ? 'pointer-events-auto' : ''} absolute right-[max(1rem,env(safe-area-inset-right))] top-1/2 -translate-y-1/2 flex flex-col items-center rounded-full bg-black/55 backdrop-blur border border-white/15`}
              role="group"
              aria-label="Cambiar canal"
            >
              <button onClick={() => onZap(1)} className="w-14 h-14 flex items-center justify-center text-white" aria-label="Canal siguiente">
                <ChevronUp className="w-7 h-7" />
              </button>
              <span className="text-[11px] font-bold text-slate-300 leading-none">CH</span>
              <button onClick={() => onZap(-1)} className="w-14 h-14 flex items-center justify-center text-white" aria-label="Canal anterior">
                <ChevronDown className="w-7 h-7" />
              </button>
            </div>
          </div>
        )}
        {osd && (
          <div className="absolute z-10 top-3 right-3 pointer-events-none rounded-xl bg-black/70 backdrop-blur px-3 py-2 max-w-[75%]">
            <p className="text-emerald-300 font-display font-bold text-lg leading-tight truncate">{osd}</p>
          </div>
        )}
        {status === 'loading' && !casting && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Loader2 className="w-10 h-10 text-violet-300 animate-spin" />
          </div>
        )}
        {status === 'error' && !casting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 text-center px-6">
            <AlertCircle className="w-8 h-8 text-red-400" />
            <p className="text-white font-semibold">Este canal no está disponible ahora</p>
            <p className="text-slate-400 text-sm">Puede estar fuera del aire o solo emitir en su país. Prueba con otro.</p>
            <button
              onClick={() => {
                setSrc(channel.url)
                setAttempt((n) => n + 1)
              }}
              className="mt-1 px-4 py-2 rounded-full bg-violet-500 text-white text-sm font-semibold"
            >
              Reintentar
            </button>
          </div>
        )}
      </div>
      <div
        className="flex items-center justify-between gap-2 px-4 sm:px-1 py-2.5"
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          const start = touchX.current
          touchX.current = null
          if (start === null) return
          const dx = e.changedTouches[0].clientX - start
          if (Math.abs(dx) > 60) onZap(dx < 0 ? 1 : -1)
        }}
      >
        <div className="flex flex-col items-center rounded-full bg-surface-2 border border-white/8 shrink-0" role="group" aria-label="Cambiar canal">
          <button onClick={() => onZap(1)} className="w-10 h-8 flex items-center justify-center text-slate-200" aria-label="Canal siguiente">
            <ChevronUp className="w-5 h-5" />
          </button>
          <span className="text-[9px] font-bold text-slate-500 leading-none">CH</span>
          <button onClick={() => onZap(-1)} className="w-10 h-8 flex items-center justify-center text-slate-200" aria-label="Canal anterior">
            <ChevronDown className="w-5 h-5" />
          </button>
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-emerald-400 text-[10px] font-bold uppercase tracking-[0.08em] font-display">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> En vivo
            {number > 0 && <span className="text-slate-500">· Canal {number} de {total}</span>}
          </p>
          <p className="text-white font-bold font-display truncate">{channel.name}</p>
        </div>
        <CastButton
          videoRef={videoRef}
          // Primero la dirección que está funcionando en el teléfono; la otra, de respaldo
          media={{
            url: src,
            altUrl: src === channel.url ? channel.fallbackUrl : channel.url,
            title: channel.name,
            poster: channel.logo || undefined,
            live: true,
          }}
        />
        <button
          onClick={onToggleFavorite}
          className={`shrink-0 w-10 h-10 rounded-full bg-surface-2 border border-white/8 flex items-center justify-center ${
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
})
