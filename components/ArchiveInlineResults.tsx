'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Play, Plus, Check, Loader2, Disc3, Library } from 'lucide-react'
import { useMusicStore } from '@/store/musicStore'
import { useLinksStore } from '@/store/linksStore'
import { toEntries, fetchAlbums } from '@/lib/link-albums'
import { loadArchiveInfo, type ArchiveInfo } from '@/lib/archive-info'

// Búsqueda de Música: también los discos de Internet Archive, para escucharlos o guardarlos ahí mismo

interface Result {
  id: string
  title: string
  artist?: string
  year?: string
  url: string
}

export default function ArchiveInlineResults({ query }: { query: string }) {
  const [results, setResults] = useState<Result[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const albums = useLinksStore((s) => s.albums)
  const addAlbum = useLinksStore((s) => s.addAlbum)

  useEffect(() => {
    const q = query.trim()
    setResults(null)
    if (!q) return
    let cancelled = false
    fetch(`/api/archive-audio?by=all&q=${encodeURIComponent(q)}`)
      .then((r) => (r.ok ? r.json() : { results: [] }))
      .then((d: { results?: Result[] }) => !cancelled && setResults((d.results ?? []).slice(0, 20)))
      .catch(() => !cancelled && setResults([]))
    return () => {
      cancelled = true
    }
  }, [query])

  if (!results?.length) return null
  const saved = new Set(albums.map((a) => a.source))

  const load = async (item: Result, mode: 'play' | 'add') => {
    setBusy(`${mode}:${item.id}`)
    setNotice('')
    try {
      const list = (await fetchAlbums(item.url)).map(toEntries)
      if (mode === 'play') {
        const st = useMusicStore.getState()
        if (st.shuffle) st.toggleShuffle()
        st.play(
          list.flatMap((e) => e.tracks),
          0
        )
      } else {
        let added = 0
        for (const e of list) added += addAlbum(e.album, e.tracks)
        setNotice(`${item.title}: ${added ? `guardado en tu biblioteca (${added} canciones)` : 'ya estaba guardado'}`)
      }
    } catch (err) {
      setNotice(`${item.title}: ${(err as Error).message}`)
    }
    setBusy(null)
  }

  return (
    <div className="mb-8">
      <h3 className="flex items-center gap-1.5 text-slate-400 text-xs font-bold uppercase tracking-[0.08em] font-display mb-3">
        <Library className="w-3.5 h-3.5 text-amber-400" /> En Internet Archive
      </h3>
      {notice && <p className="text-emerald-300 text-xs mb-2">{notice}</p>}
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x scroll-px-4 [scrollbar-width:none]">
        {results.map((r) => (
          <Card key={r.id} r={r} busy={busy} saved={saved.has(r.url)} onPlay={() => load(r, 'play')} onAdd={() => load(r, 'add')} />
        ))}
      </div>
    </div>
  )
}

function Card({ r, busy, saved, onPlay, onAdd }: { r: Result; busy: string | null; saved: boolean; onPlay: () => void; onAdd: () => void }) {
  const [info, setInfo] = useState<ArchiveInfo | null | undefined>(undefined)
  const [failed, setFailed] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let cancelled = false
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        io.disconnect()
        loadArchiveInfo(r.id).then((d) => !cancelled && setInfo(d))
      },
      { rootMargin: '300px' }
    )
    io.observe(el)
    return () => {
      cancelled = true
      io.disconnect()
    }
  }, [r.id])
  const noAudio = info && !info.tracks
  return (
    <div ref={ref} className={`shrink-0 w-36 sm:w-40 snap-start ${noAudio ? 'opacity-50' : ''}`}>
      <div className={`relative aspect-square rounded-xl overflow-hidden bg-surface-2 border border-white/8 flex items-center justify-center ${info === undefined ? 'animate-pulse' : ''}`}>
        <Link href={`/music/archive/${encodeURIComponent(r.id)}`} className="absolute inset-0 flex items-center justify-center" aria-label={`Ver ${r.title}`}>
          {info?.cover && !failed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={info.cover} alt="" loading="lazy" onError={() => setFailed(true)} className="absolute inset-0 w-full h-full object-cover" />
          ) : info !== undefined ? (
            <Disc3 className="w-12 h-12 text-slate-500" />
          ) : null}
        </Link>
        <button
          onClick={onAdd}
          disabled={!!busy || saved || !!noAudio}
          className={`absolute top-1.5 right-1.5 w-8 h-8 rounded-full bg-black/60 border flex items-center justify-center ${saved ? 'border-emerald-400/50 text-emerald-300' : 'border-white/20 text-white'}`}
          aria-label={saved ? 'Guardado' : `Guardar ${r.title}`}
        >
          {busy === `add:${r.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        </button>
        <button
          onClick={onPlay}
          disabled={!!busy || !!noAudio}
          className="absolute bottom-1.5 right-1.5 w-10 h-10 rounded-full bg-violet-500 text-white flex items-center justify-center shadow-lg"
          aria-label={`Escuchar ${r.title}`}
        >
          {busy === `play:${r.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-white" />}
        </button>
      </div>
      <Link href={`/music/archive/${encodeURIComponent(r.id)}`} className="block text-white text-sm font-semibold font-display leading-tight line-clamp-2 mt-2">
        {r.title}
      </Link>
      <p className="text-slate-500 text-xs truncate">
        {[r.artist, r.year || info?.year, info?.tracks ? `${info.tracks} canc.` : noAudio ? 'sin audio' : ''].filter(Boolean).join(' · ')}
      </p>
    </div>
  )
}
