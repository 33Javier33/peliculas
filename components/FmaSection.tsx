'use client'

import { useMemo, useState } from 'react'
import { Search, Play, Plus, Check, Loader2, Disc3, Music2, Radio } from 'lucide-react'
import { useMusicStore } from '@/store/musicStore'
import { useLinksStore } from '@/store/linksStore'
import { toEntries, fetchAlbums, type ApiAlbum } from '@/lib/link-albums'
import { useTrackState } from '@/components/TrackState'
import { searchOpenverse } from '@/lib/openverse'

// Free Music Archive: música con licencias libres. Se busca por artista, disco o canción (o por
// género), se escucha al tiro o se guarda el disco en "Desde un enlace".

interface FmaTrack {
  id: string
  title: string
  artist: string
  album?: string
  albumUrl?: string
  url: string
  image?: string
  duration?: number
}

const GENRES: { id: string; label: string }[] = [
  { id: 'Rock', label: 'Rock' },
  { id: 'Electronic', label: 'Electrónica' },
  { id: 'Hip-Hop', label: 'Hip-Hop' },
  { id: 'Folk', label: 'Folk' },
  { id: 'Jazz', label: 'Jazz' },
  { id: 'Classical', label: 'Clásica' },
  { id: 'Pop', label: 'Pop' },
  { id: 'International', label: 'Del mundo' },
  { id: 'Instrumental', label: 'Instrumental' },
  { id: 'Experimental', label: 'Experimental' },
]

/** Un disco armado con las canciones encontradas (la página del disco trae el resto) */
function groupAlbums(tracks: FmaTrack[]): ApiAlbum[] {
  const map = new Map<string, ApiAlbum>()
  for (const t of tracks) {
    const title = t.album || 'Sencillos'
    const key = t.albumUrl || `${t.artist}|${title}`
    const a = map.get(key) ?? { title, artist: t.artist, cover: t.image, source: t.albumUrl || `https://freemusicarchive.org/#${encodeURIComponent(key)}`, tracks: [] }
    a.tracks.push({ title: t.title, url: t.url, playUrl: t.url, artist: t.artist, duration: t.duration })
    a.cover ||= t.image
    map.set(key, a)
  }
  return Array.from(map.values())
}

const fmt = (s?: number) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '')

export default function FmaSection() {
  const albums = useLinksStore((s) => s.albums)
  const addAlbum = useLinksStore((s) => s.addAlbum)
  const [q, setQ] = useState('')
  const [tracks, setTracks] = useState<FmaTrack[]>([])
  const [last, setLast] = useState<{ params: string; page: number; more: boolean } | null>(null)
  const [mode, setMode] = useState<'songs' | 'albums'>('songs')
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [source, setSource] = useState<'fma' | 'openverse' | null>(null)

  const run = async (params: string, page = 1) => {
    setSearching(true)
    setError('')
    try {
      const r = await fetch(`/api/fma?${params}&page=${page}`).catch(() => null)
      const d = ((await r?.json().catch(() => ({}))) ?? {}) as { tracks?: FmaTrack[]; source?: 'fma' | 'openverse'; error?: string }
      let list = d.tracks ?? []
      let from = d.source ?? null
      if (!r?.ok || !list.length) {
        // El servidor no consiguió nada: el teléfono busca directo en Jamendo (Openverse)
        const sp = new URLSearchParams(params)
        list = await searchOpenverse(sp.get('q') || '', page, sp.get('genre') || '').catch(() => {
          throw new Error(d.error || 'No se pudo buscar')
        })
        from = 'openverse'
      }
      setSource(from)
      setTracks((prev) => (page === 1 ? list : [...prev, ...list.filter((t) => !prev.some((p) => p.id === t.id))]))
      setLast({ params, page, more: list.length >= 20 })
      if (page === 1 && !list.length) setError('No se encontró nada con esa búsqueda')
    } catch (err) {
      setError((err as Error).message)
    }
    setSearching(false)
  }

  const groups = useMemo(() => groupAlbums(tracks), [tracks])
  const songs = useMemo(() => groups.flatMap((g) => toEntries(g).tracks), [groups])
  const byUrl = useMemo(() => new Map(songs.map((s) => [s.audioUrl, s])), [songs])
  const saved = new Set(albums.map((a) => a.source))

  const playFrom = (url: string) => {
    const list = tracks.map((t) => byUrl.get(t.url)).filter((t): t is NonNullable<typeof t> => !!t)
    const i = Math.max(0, list.findIndex((t) => t.audioUrl === url))
    const st = useMusicStore.getState()
    if (st.shuffle) st.toggleShuffle()
    st.play(list, i)
  }

  /** Disco completo: de su página en FMA si se puede; si no, con las canciones encontradas */
  const fullAlbum = async (g: ApiAlbum): Promise<ApiAlbum[]> => {
    if (!g.source.includes('#')) {
      const list = await fetchAlbums(g.source).catch(() => [])
      if (list.length) return list
    }
    return [g]
  }

  const playAlbum = async (g: ApiAlbum) => {
    setBusy(`play:${g.source}`)
    const list = (await fullAlbum(g)).flatMap((a) => toEntries(a).tracks)
    const st = useMusicStore.getState()
    if (st.shuffle) st.toggleShuffle()
    st.play(list, 0)
    setBusy(null)
  }

  const saveAlbum = async (g: ApiAlbum) => {
    setBusy(`add:${g.source}`)
    setNotice('')
    let added = 0
    for (const a of await fullAlbum(g)) {
      const { album, tracks: items } = toEntries({ ...a, source: g.source })
      added += addAlbum(album, items)
    }
    setNotice(`${g.title}: ${added ? `${added} ${added === 1 ? 'canción guardada' : 'canciones guardadas'} en "Desde un enlace"` : 'ya estaba guardado'}`)
    setBusy(null)
  }

  return (
    <section className="mb-10 rounded-2xl bg-surface-1/60 border border-white/8 p-4">
      <h2 className="flex items-center gap-2 text-white font-bold text-lg font-display">
        <Radio className="w-5 h-5 text-rose-400" /> Free Music Archive · Jamendo
      </h2>
      <p className="text-slate-400 text-xs mt-0.5 mb-3">Música libre (Creative Commons) de artistas independientes. Suena con la pantalla bloqueada.</p>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (q.trim()) run(`q=${encodeURIComponent(q.trim())}`)
        }}
        className="flex gap-2"
      >
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Artista, disco o canción"
          aria-label="Buscar en Free Music Archive"
          className="min-w-0 flex-1 bg-surface-2 border border-white/10 text-white placeholder-slate-500 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:border-rose-400"
        />
        <button type="submit" disabled={searching || !q.trim()} className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-rose-500 text-white text-sm font-semibold disabled:opacity-50">
          {searching && last?.page !== undefined && !tracks.length ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Buscar
        </button>
      </form>

      <div className="flex gap-2 mt-3 overflow-x-auto -mx-4 px-4 [scrollbar-width:none]">
        {GENRES.map((g) => (
          <button
            key={g.id}
            onClick={() => {
              setQ('')
              run(`genre=${g.id}`)
            }}
            className={`shrink-0 px-3 py-1.5 rounded-full border text-xs ${last?.params === `genre=${g.id}` ? 'bg-rose-500 border-rose-400 text-white' : 'bg-surface-2 border-white/10 text-slate-300'}`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {error && <p className="text-amber-300 text-sm mt-2">{error}</p>}
      {notice && <p className="text-emerald-300 text-sm mt-2">{notice}</p>}

      {tracks.length > 0 && (
        <>
          <div className="flex gap-2 mt-3" role="tablist" aria-label="Ver como">
            {(
              [
                ['songs', `Canciones (${tracks.length})`, Music2],
                ['albums', `Discos (${groups.length})`, Disc3],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                role="tab"
                aria-selected={mode === id}
                onClick={() => setMode(id)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border text-xs font-semibold ${mode === id ? 'bg-rose-500 border-rose-400 text-white' : 'bg-surface-2 border-white/10 text-slate-300'}`}
              >
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>

          <ul className="mt-2 divide-y divide-white/5 max-h-[26rem] overflow-y-auto overscroll-contain">
            {mode === 'songs'
              ? tracks.map((t) => <SongRow key={t.id} t={t} id={byUrl.get(t.url)?.id ?? ''} onPlay={() => playFrom(t.url)} />)
              : groups.map((g) => (
                  <li key={g.source} className="flex items-center gap-3 py-2">
                    <Cover src={g.cover} />
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-sm font-semibold line-clamp-2">{g.title}</p>
                      <p className="text-slate-400 text-xs truncate">
                        {g.artist} · {g.tracks.length} {g.tracks.length === 1 ? 'canción encontrada' : 'canciones encontradas'}
                      </p>
                    </div>
                    <button
                      onClick={() => saveAlbum(g)}
                      disabled={!!busy || saved.has(g.source)}
                      className={`shrink-0 w-9 h-9 rounded-full border flex items-center justify-center ${saved.has(g.source) ? 'border-emerald-400/40 text-emerald-300' : 'border-white/10 text-slate-200'}`}
                      aria-label={saved.has(g.source) ? 'Guardado' : `Guardar ${g.title}`}
                    >
                      {busy === `add:${g.source}` ? <Loader2 className="w-4 h-4 animate-spin" /> : saved.has(g.source) ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    </button>
                    <button onClick={() => playAlbum(g)} disabled={!!busy} className="shrink-0 w-10 h-10 rounded-full bg-violet-500 text-white flex items-center justify-center disabled:opacity-60" aria-label={`Escuchar ${g.title}`}>
                      {busy === `play:${g.source}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-white" />}
                    </button>
                  </li>
                ))}
          </ul>
          {last?.more && (
            <button
              onClick={() => run(last.params, last.page + 1)}
              disabled={searching}
              className="mt-3 w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-full bg-surface-2 border border-white/10 text-slate-200 text-sm disabled:opacity-50"
            >
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Ver más
            </button>
          )}
        </>
      )}
      <p className="text-slate-600 text-xs mt-3">
        {source === 'openverse'
          ? 'Resultados de Jamendo y otras bibliotecas de música libre (vía Openverse): Free Music Archive no respondió.'
          : 'Canciones con licencias Creative Commons de freemusicarchive.org (si no responde, de Jamendo).'}
      </p>
    </section>
  )
}

function Cover({ src }: { src?: string }) {
  const [failed, setFailed] = useState(false)
  return (
    <span className="shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-surface-2 flex items-center justify-center">
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className="w-full h-full object-cover" />
      ) : (
        <Disc3 className="w-6 h-6 text-slate-500" />
      )}
    </span>
  )
}

function SongRow({ t, id, onPlay }: { t: FmaTrack; id: string; onPlay: () => void }) {
  const state = useTrackState(id)
  return (
    <li className={`flex items-center gap-3 py-2 ${state ? 'bg-violet-500/10 -mx-2 px-2 rounded-lg' : ''}`}>
      <Cover src={t.image} />
      <button onClick={onPlay} className="min-w-0 flex-1 text-left">
        <p className={`text-sm font-semibold truncate ${state ? 'text-violet-300' : 'text-white'}`}>{t.title}</p>
        <p className="text-slate-400 text-xs truncate">{[t.artist, t.album].filter(Boolean).join(' · ')}</p>
      </button>
      <span className="shrink-0 text-slate-500 text-xs tabular-nums">{state === 'loading' ? <Loader2 className="w-4 h-4 animate-spin text-violet-300" /> : fmt(t.duration)}</span>
      <button onClick={onPlay} className="shrink-0 w-9 h-9 rounded-full bg-violet-500 text-white flex items-center justify-center" aria-label={`Escuchar ${t.title}`}>
        <Play className="w-4 h-4 fill-white" />
      </button>
    </li>
  )
}
