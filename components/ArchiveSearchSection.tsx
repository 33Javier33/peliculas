'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Search, Play, Plus, Check, Loader2, Library, Disc3, ArrowLeft, UserRound, ChevronRight } from 'lucide-react'
import { useMusicStore } from '@/store/musicStore'
import { useLinksStore } from '@/store/linksStore'
import { toEntries, fetchAlbums } from '@/lib/link-albums'
import { loadArchiveInfo as loadInfo, type ArchiveInfo as Info } from '@/lib/archive-info'
import { useView } from '@/components/ViewToggle'
import type { MusicVideo } from '@/lib/youtube-music'

// Buscador de Internet Archive: discos y grabaciones para escuchar al tiro o guardar en
// "Desde un enlace" (ordenados por disco, con su carátula e información).

interface Result {
  id: string
  title: string
  artist?: string
  year?: string
  cover: string
  url: string
}

interface Artist {
  name: string
  count: number
  cover: string
}

type Mode = 'artist' | 'album' | 'all'
const MODES: { id: Mode; label: string }[] = [
  { id: 'artist', label: 'Artistas' },
  { id: 'album', label: 'Discos' },
  { id: 'all', label: 'Todo' },
]

const SUGGESTIONS = ['Rock', 'Jazz', 'Clásica', 'Cumbia', 'Tango', 'Conciertos en vivo']
const TOP = 'Lo más escuchado'
const FREE_SUGGESTIONS = [TOP, 'Rock', 'Electronic', 'Hip hop', 'Jazz', 'Ambient', 'Pop', 'Folk', 'Latin']

// "archive": todo Internet Archive. "free": solo música libre (Jamendo, Free Music Archive y
// sellos independientes que archive.org guarda con licencias Creative Commons).
const VARIANTS = {
  archive: {
    title: 'Internet Archive',
    subtitle: 'Busca discos y conciertos de la biblioteca de archive.org. Suenan con la pantalla bloqueada.',
    icon: 'text-amber-400',
    suggestions: SUGGESTIONS,
    mode: 'artist' as Mode,
    footer: 'Escucha lo que la biblioteca ofrece libremente (dominio público, licencias libres y conciertos con permiso).',
  },
  free: {
    title: 'Música libre · Jamendo y Free Music Archive',
    subtitle: 'Artistas independientes con licencias Creative Commons (copias guardadas en archive.org). Suenan con la pantalla bloqueada.',
    icon: 'text-rose-400',
    suggestions: FREE_SUGGESTIONS,
    mode: 'all' as Mode,
    footer: 'Música de Jamendo, Free Music Archive y netlabels, libre para escuchar y compartir.',
  },
}

export default function ArchiveSearchSection({ variant = 'archive' }: { variant?: keyof typeof VARIANTS }) {
  const cfg = VARIANTS[variant]
  const view = useView()
  const albums = useLinksStore((s) => s.albums)
  const addAlbum = useLinksStore((s) => s.addAlbum)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<Record<string, 'play' | 'add' | undefined>>({})
  const [notice, setNotice] = useState('')
  // Artistas: primero la lista de artistas; al tocar uno, sus discos
  const [mode, setMode] = useState<Mode>(cfg.mode)
  const [artists, setArtists] = useState<Artist[] | null>(null)
  const [artist, setArtist] = useState<string | null>(null)

  const fetchJson = async <T,>(params: string): Promise<T> => {
    const r = await fetch(`/api/archive-audio?${params}${variant === 'free' ? '&scope=free' : ''}`)
    const d = (await r.json()) as T & { error?: string }
    if (!r.ok) throw new Error(d.error || 'No se pudo buscar')
    return d
  }

  /** Discos: de la búsqueda (por disco o en todo) o de un artista elegido */
  const searchItems = async (params: string, nextPage = 1) => {
    setSearching(true)
    setError('')
    try {
      const d = await fetchJson<{ results?: Result[]; total?: number }>(`${params}&page=${nextPage}`)
      setResults((prev) => (nextPage === 1 ? d.results ?? [] : [...prev, ...(d.results ?? [])]))
      setTotal(d.total ?? 0)
      setPage(nextPage)
      if (nextPage === 1 && !d.results?.length) setError('No se encontró nada con esa búsqueda')
    } catch (err) {
      setError((err as Error).message)
    }
    setSearching(false)
  }

  const itemsParams = (text: string, m: Mode, who: string | null) =>
    who
      ? `by=exactArtist&q=${encodeURIComponent(who)}`
      : text === 'Conciertos en vivo'
        ? 'collection=etree' // grabaciones de conciertos (Live Music Archive)
        : `by=${m}&q=${encodeURIComponent(text)}`

  const search = async (query: string, m: Mode = mode) => {
    const text = query.trim()
    if (text === TOP) {
      setArtist(null)
      setArtists(null)
      setResults([])
      return searchItems('by=all&q=')
    }
    if (!text) return
    setArtist(null)
    setResults([])
    setArtists(null)
    if (m !== 'artist' || text === 'Conciertos en vivo') return searchItems(itemsParams(text, m === 'artist' ? 'all' : m, null))
    setSearching(true)
    setError('')
    try {
      const d = await fetchJson<{ artists?: Artist[] }>(`by=artist&q=${encodeURIComponent(text)}`)
      setArtists(d.artists ?? [])
      if (!d.artists?.length) setError('No se encontraron artistas con ese nombre. Prueba en "Discos" o "Todo".')
    } catch (err) {
      setError((err as Error).message)
    }
    setSearching(false)
  }

  const openArtist = (name: string) => {
    setArtist(name)
    setResults([])
    searchItems(itemsParams('', mode, name))
  }
  const more = () =>
    searchItems(q.trim() === TOP ? 'by=all&q=' : itemsParams(q.trim(), mode === 'artist' ? 'all' : mode, artist), page + 1)

  const load = async (item: Result, mode: 'play' | 'add') => {
    setBusy((b) => ({ ...b, [item.id]: mode }))
    setNotice('')
    try {
      const list = (await fetchAlbums(item.url)).map(toEntries)
      if (mode === 'play') {
        const tracks: MusicVideo[] = list.flatMap((e) => e.tracks)
        const st = useMusicStore.getState()
        if (st.shuffle) st.toggleShuffle()
        st.play(tracks, 0)
      } else {
        let added = 0
        for (const e of list) added += addAlbum(e.album, e.tracks)
        setNotice(`${item.title}: ${added ? `${added} ${added === 1 ? 'canción guardada' : 'canciones guardadas'} en "Desde un enlace"` : 'ya estaba guardado'}`)
      }
    } catch (err) {
      setNotice(`${item.title}: ${(err as Error).message}`)
    }
    setBusy((b) => ({ ...b, [item.id]: undefined }))
  }

  const saved = new Set(albums.map((a) => a.source))

  return (
    <section className="mb-10 rounded-2xl bg-surface-1/60 border border-white/8 p-4">
      <h2 className="flex items-center gap-2 text-white font-bold text-lg font-display">
        <Library className={`w-5 h-5 ${cfg.icon}`} /> {cfg.title}
      </h2>
      <p className="text-slate-400 text-xs mt-0.5 mb-3">{cfg.subtitle}</p>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          search(q)
        }}
        className="flex gap-2"
      >
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Artista, disco o género"
          aria-label={`Buscar en ${cfg.title}`}
          className="min-w-0 flex-1 bg-surface-2 border border-white/10 text-white placeholder-slate-500 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:border-amber-400"
        />
        <button type="submit" disabled={searching || !q.trim()} className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-amber-500 text-black text-sm font-semibold disabled:opacity-50">
          {searching && page === 1 && !artist ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Buscar
        </button>
      </form>

      <div className="flex gap-2 mt-3" role="tablist" aria-label="Buscar por">
        {MODES.map((m) => (
          <button
            key={m.id}
            role="tab"
            aria-selected={mode === m.id}
            onClick={() => {
              setMode(m.id)
              if (q.trim()) search(q, m.id)
            }}
            className={`px-3.5 py-1.5 rounded-full border text-xs font-semibold ${mode === m.id ? 'bg-amber-500 border-amber-400 text-black' : 'bg-surface-2 border-white/10 text-slate-300'}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {results.length === 0 && !artists && !searching && (
        <div className="flex flex-wrap gap-2 mt-3">
          {cfg.suggestions.map((s) => (
            <button
              key={s}
              onClick={() => {
                setQ(s)
                setMode('all')
                search(s, 'all')
              }}
              className="px-3 py-1.5 rounded-full bg-surface-2 border border-white/10 text-slate-300 text-xs hover:border-amber-400/50"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      {error && <p className="text-amber-300 text-sm mt-2">{error}</p>}
      {notice && <p className="text-emerald-300 text-sm mt-2">{notice}</p>}

      {/* Artistas encontrados */}
      {artists && artists.length > 0 && !artist && (
        <ul className="mt-3 divide-y divide-white/5 max-h-[26rem] overflow-y-auto overscroll-contain">
          {artists.map((a) => (
            <li key={a.name}>
              <button onClick={() => openArtist(a.name)} className="w-full flex items-center gap-3 py-2 text-left">
                <ArtistAvatar src={a.cover} />
                <span className="min-w-0 flex-1">
                  <span className="block text-white text-sm font-semibold truncate">{a.name}</span>
                  <span className="block text-slate-400 text-xs">{a.count >= 200 ? 'Muchos' : a.count} {a.count === 1 ? 'disco' : 'discos'}</span>
                </span>
                <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Discos de un artista */}
      {artist && (
        <div className="mt-3 flex items-center gap-2">
          <button onClick={() => setArtist(null)} className="shrink-0 w-9 h-9 rounded-full bg-surface-2 border border-white/10 text-slate-200 flex items-center justify-center" aria-label="Volver a los artistas">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <p className="text-white font-semibold truncate">{artist}</p>
            <p className="text-slate-400 text-xs">{searching && !results.length ? 'Buscando discos…' : `${total.toLocaleString('es')} ${total === 1 ? 'disco' : 'discos'}`}</p>
          </div>
        </div>
      )}

      {results.length > 0 && (mode !== 'artist' || artist || q.trim() === 'Conciertos en vivo') && (
        <>
          {!artist && <p className="text-slate-500 text-xs mt-3">{total.toLocaleString('es')} resultados</p>}
          <ul className={`mt-2 max-h-[26rem] overflow-y-auto overscroll-contain ${view === 'grid' ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3' : 'divide-y divide-white/5'}`}>
            {results.map((item) => (
              <ResultRow key={item.id} grid={view === 'grid'} item={item} busy={busy[item.id]} saved={saved.has(item.url)} onPlay={() => load(item, 'play')} onAdd={() => load(item, 'add')} />
            ))}
          </ul>
          {results.length < total && (
            <button
              onClick={more}
              disabled={searching}
              className="mt-3 w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-full bg-surface-2 border border-white/10 text-slate-200 text-sm disabled:opacity-50"
            >
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Ver más
            </button>
          )}
        </>
      )}
      <p className="text-slate-600 text-xs mt-3">{cfg.footer}</p>
    </section>
  )
}

function ArtistAvatar({ src }: { src: string }) {
  const [failed, setFailed] = useState(false)
  return (
    <span className="shrink-0 w-12 h-12 rounded-full overflow-hidden bg-surface-2 flex items-center justify-center">
      {!failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className="w-full h-full object-cover" />
      ) : (
        <UserRound className="w-6 h-6 text-slate-500" />
      )}
    </span>
  )
}

function ResultRow({
  item,
  busy,
  saved,
  onPlay,
  onAdd,
  grid = false,
}: {
  item: Result
  busy?: 'play' | 'add'
  saved: boolean
  onPlay: () => void
  onAdd: () => void
  grid?: boolean
}) {
  const [failed, setFailed] = useState(false)
  const [info, setInfo] = useState<Info | null | undefined>(undefined)
  const ref = useRef<HTMLLIElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let cancelled = false
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        io.disconnect()
        loadInfo(item.id).then((d) => !cancelled && setInfo(d))
      },
      { rootMargin: '200px' }
    )
    io.observe(el)
    return () => {
      cancelled = true
      io.disconnect()
    }
  }, [item.id])
  const cover = info?.cover
  const details = [item.artist, item.year || info?.year, info ? (info.tracks ? `${info.tracks} ${info.tracks === 1 ? 'canción' : 'canciones'}` : 'sin audio') : null]
    .filter(Boolean)
    .join(' · ')
  // Tocar el disco abre su página con todas las canciones
  const href = `/music/archive/${encodeURIComponent(item.id)}`
  const addIcon = busy === 'add' ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />
  const playIcon = busy === 'play' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-white" />
  if (grid)
    return (
      <li ref={ref} className={info && !info.tracks ? 'opacity-50' : ''}>
        <div className={`relative aspect-square rounded-xl overflow-hidden bg-surface-2 flex items-center justify-center ${info === undefined ? 'animate-pulse' : ''}`}>
          <Link href={href} className="absolute inset-0 flex items-center justify-center" aria-label={`Ver ${item.title}`}>
            {cover && !failed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover} alt="" loading="lazy" onError={() => setFailed(true)} className="absolute inset-0 w-full h-full object-cover" />
            ) : info !== undefined ? (
              <Disc3 className="w-10 h-10 text-slate-500" />
            ) : null}
          </Link>
          <button
            onClick={onAdd}
            disabled={!!busy || saved}
            className={`absolute top-1.5 right-1.5 w-8 h-8 rounded-full bg-black/60 border flex items-center justify-center ${saved ? 'border-emerald-400/50 text-emerald-300' : 'border-white/20 text-white'}`}
            aria-label={saved ? 'Guardado' : `Guardar ${item.title}`}
          >
            {addIcon}
          </button>
          <button onClick={onPlay} disabled={!!busy} className="absolute bottom-1.5 right-1.5 w-10 h-10 rounded-full bg-violet-500 text-white flex items-center justify-center shadow-lg" aria-label={`Escuchar ${item.title}`}>
            {playIcon}
          </button>
        </div>
        <Link href={href} className="block text-white text-sm font-semibold leading-tight line-clamp-2 mt-2">
          {item.title}
        </Link>
        <p className="text-slate-400 text-xs truncate">{details}</p>
      </li>
    )
  return (
    <li ref={ref} className={`flex items-center gap-3 py-2 ${info && !info.tracks ? 'opacity-50' : ''}`}>
      <Link href={href} className="min-w-0 flex-1 flex items-center gap-3">
      <span className={`shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-surface-2 flex items-center justify-center ${info === undefined ? 'animate-pulse' : ''}`}>
        {cover && !failed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" loading="lazy" onError={() => setFailed(true)} className="w-full h-full object-cover" />
        ) : info !== undefined ? (
          <Disc3 className="w-7 h-7 text-slate-500" />
        ) : null}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-white text-sm font-semibold line-clamp-2">{item.title}</p>
        <p className="text-slate-400 text-xs truncate">{details}</p>
      </div>
      </Link>
      <button
        onClick={onAdd}
        disabled={!!busy || saved}
        className={`shrink-0 w-9 h-9 rounded-full border flex items-center justify-center ${saved ? 'border-emerald-400/40 text-emerald-300' : 'border-white/10 text-slate-200'} disabled:cursor-default`}
        aria-label={saved ? 'Guardado' : `Guardar ${item.title}`}
      >
        {addIcon}
      </button>
      <button onClick={onPlay} disabled={!!busy} className="shrink-0 w-10 h-10 rounded-full bg-violet-500 text-white flex items-center justify-center disabled:opacity-60" aria-label={`Escuchar ${item.title}`}>
        {playIcon}
      </button>
    </li>
  )
}
