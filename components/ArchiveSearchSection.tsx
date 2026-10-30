'use client'

import { useState } from 'react'
import { Search, Play, Plus, Check, Loader2, Library, Disc3 } from 'lucide-react'
import { useMusicStore } from '@/store/musicStore'
import { useLinksStore } from '@/store/linksStore'
import { toEntries, fetchAlbums } from '@/lib/link-albums'
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

const SUGGESTIONS = ['Rock', 'Jazz', 'Clásica', 'Cumbia', 'Tango', 'Conciertos en vivo']

export default function ArchiveSearchSection() {
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

  const search = async (query: string, nextPage = 1) => {
    const text = query.trim()
    if (!text) return
    setSearching(true)
    setError('')
    try {
      // "Conciertos en vivo": la colección de grabaciones de conciertos (Live Music Archive)
      const params = text === 'Conciertos en vivo' ? 'collection=etree' : `q=${encodeURIComponent(text)}`
      const r = await fetch(`/api/archive-audio?${params}&page=${nextPage}`)
      const d = (await r.json()) as { results?: Result[]; total?: number; error?: string }
      if (!r.ok) throw new Error(d.error || 'No se pudo buscar')
      setResults((prev) => (nextPage === 1 ? d.results ?? [] : [...prev, ...(d.results ?? [])]))
      setTotal(d.total ?? 0)
      setPage(nextPage)
      if (nextPage === 1 && !d.results?.length) setError('No se encontró nada con esa búsqueda')
    } catch (err) {
      setError((err as Error).message)
    }
    setSearching(false)
  }

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
        <Library className="w-5 h-5 text-amber-400" /> Internet Archive
      </h2>
      <p className="text-slate-400 text-xs mt-0.5 mb-3">Busca discos y conciertos de la biblioteca de archive.org. Suenan con la pantalla bloqueada.</p>

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
          aria-label="Buscar en Internet Archive"
          className="min-w-0 flex-1 bg-surface-2 border border-white/10 text-white placeholder-slate-500 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:border-amber-400"
        />
        <button type="submit" disabled={searching || !q.trim()} className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-amber-500 text-black text-sm font-semibold disabled:opacity-50">
          {searching && page === 1 ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Buscar
        </button>
      </form>

      {results.length === 0 && !searching && (
        <div className="flex flex-wrap gap-2 mt-3">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => {
                setQ(s)
                search(s)
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

      {results.length > 0 && (
        <>
          <p className="text-slate-500 text-xs mt-3">{total.toLocaleString('es')} resultados</p>
          <ul className="mt-2 divide-y divide-white/5">
            {results.map((item) => (
              <ResultRow key={item.id} item={item} busy={busy[item.id]} saved={saved.has(item.url)} onPlay={() => load(item, 'play')} onAdd={() => load(item, 'add')} />
            ))}
          </ul>
          {results.length < total && (
            <button
              onClick={() => search(q, page + 1)}
              disabled={searching}
              className="mt-3 w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-full bg-surface-2 border border-white/10 text-slate-200 text-sm disabled:opacity-50"
            >
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Ver más
            </button>
          )}
        </>
      )}
      <p className="text-slate-600 text-xs mt-3">Escucha lo que la biblioteca ofrece libremente (dominio público, licencias libres y conciertos con permiso).</p>
    </section>
  )
}

function ResultRow({ item, busy, saved, onPlay, onAdd }: { item: Result; busy?: 'play' | 'add'; saved: boolean; onPlay: () => void; onAdd: () => void }) {
  const [failed, setFailed] = useState(false)
  return (
    <li className="flex items-center gap-3 py-2">
      <span className="shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-surface-2 flex items-center justify-center">
        {!failed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.cover} alt="" loading="lazy" onError={() => setFailed(true)} className="w-full h-full object-cover" />
        ) : (
          <Disc3 className="w-7 h-7 text-slate-500" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-white text-sm font-semibold line-clamp-2">{item.title}</p>
        <p className="text-slate-400 text-xs truncate">{[item.artist, item.year].filter(Boolean).join(' · ')}</p>
      </div>
      <button
        onClick={onAdd}
        disabled={!!busy || saved}
        className={`shrink-0 w-9 h-9 rounded-full border flex items-center justify-center ${saved ? 'border-emerald-400/40 text-emerald-300' : 'border-white/10 text-slate-200'} disabled:cursor-default`}
        aria-label={saved ? 'Guardado' : `Guardar ${item.title}`}
      >
        {busy === 'add' ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
      </button>
      <button onClick={onPlay} disabled={!!busy} className="shrink-0 w-10 h-10 rounded-full bg-violet-500 text-white flex items-center justify-center disabled:opacity-60" aria-label={`Escuchar ${item.title}`}>
        {busy === 'play' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-white" />}
      </button>
    </li>
  )
}
