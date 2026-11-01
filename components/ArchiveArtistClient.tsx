'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Play, Shuffle, Loader2, Disc3, UserRound, AlertCircle, ExternalLink } from 'lucide-react'
import BackButton from '@/components/BackButton'
import MusicInfoPanel from '@/components/MusicInfoPanel'
import { useMusicStore } from '@/store/musicStore'
import { toEntries, fetchAlbums } from '@/lib/link-albums'
import type { MusicVideo } from '@/lib/youtube-music'

// Artista de Internet Archive: su discografía (todos los discos con su nombre) para escuchar.
// Se llega desde el menú ⋮ del reproductor ("Ir al artista" / "Ver discografía").

interface Result {
  id: string
  title: string
  artist?: string
  year?: string
  cover: string
  url: string
}

export default function ArchiveArtistClient({ name }: { name: string }) {
  const [results, setResults] = useState<Result[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setResults(null)
    setError('')
    const load = async () => {
      // Primero el nombre exacto; si no hay discos, una búsqueda más amplia por artista
      for (const by of ['exactArtist', 'artist-all']) {
        const params = by === 'exactArtist' ? `by=exactArtist&q=${encodeURIComponent(name)}` : `by=all&q=${encodeURIComponent(name)}`
        const r = await fetch(`/api/archive-audio?${params}`)
        const d = (await r.json().catch(() => ({}))) as { results?: Result[]; error?: string }
        if (!r.ok) throw new Error(d.error || 'No se pudo buscar')
        if (d.results?.length) return d.results
      }
      return []
    }
    load()
      .then((list) => {
        if (cancelled) return
        // Más antiguos primero (orden de discografía); sin año, al final
        setResults([...list].sort((a, b) => (a.year || '9999').localeCompare(b.year || '9999')))
      })
      .catch((e) => !cancelled && (setError((e as Error).message), setResults([])))
    return () => {
      cancelled = true
    }
  }, [name])

  // Reproducir toda la discografía (en orden o al azar)
  const playAll = async (shuffle: boolean) => {
    if (!results?.length) return
    setBusy(shuffle ? 'shuffle' : 'all')
    try {
      const lists = await Promise.all(results.slice(0, 12).map((r) => fetchAlbums(r.url).catch(() => [])))
      const tracks: MusicVideo[] = lists.flat().flatMap((a) => toEntries(a).tracks)
      if (!tracks.length) throw new Error('Estos discos no tienen canciones para escuchar')
      const st = useMusicStore.getState()
      if (st.shuffle !== shuffle) st.toggleShuffle()
      st.play(tracks, shuffle ? Math.floor(Math.random() * tracks.length) : 0)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="pt-20 min-h-screen bg-obsidian pb-32">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <BackButton fallbackHref="/music" className="inline-flex items-center gap-1.5 text-slate-500 hover:text-violet-400 text-xs font-medium">
          <ArrowLeft className="w-3.5 h-3.5" />
          Volver
        </BackButton>
        <div className="flex items-center gap-4 mt-4">
          <div className="w-20 h-20 shrink-0 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center">
            <UserRound className="w-10 h-10 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Artista · Internet Archive</p>
            <h1 className="text-2xl font-bold text-white font-display break-words">{name}</h1>
            {results && <p className="text-slate-400 text-sm">{results.length} {results.length === 1 ? 'disco' : 'discos'}</p>}
          </div>
        </div>

        {results && results.length > 0 && (
          <div className="flex gap-2 mt-5">
            <button
              onClick={() => playAll(false)}
              disabled={!!busy}
              className="flex items-center gap-2 rounded-full bg-violet-500 px-5 py-2.5 text-sm font-semibold text-white"
            >
              {busy === 'all' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Reproducir todo
            </button>
            <button
              onClick={() => playAll(true)}
              disabled={!!busy}
              className="flex items-center gap-2 rounded-full bg-surface-2 border border-white/10 px-5 py-2.5 text-sm font-semibold text-white"
            >
              {busy === 'shuffle' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shuffle className="w-4 h-4" />} Aleatorio
            </button>
          </div>
        )}

        {error && (
          <p className="mt-5 flex items-center gap-2 text-sm text-red-400">
            <AlertCircle className="w-4 h-4" /> {error}
          </p>
        )}

        <h2 id="discografia" className="text-white font-bold text-lg font-display mt-8 mb-3 scroll-mt-24">
          Discografía
        </h2>
        {results === null ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
          </div>
        ) : results.length === 0 ? (
          <p className="text-slate-500 text-sm">No se encontraron discos de este artista en Internet Archive.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {results.map((r) => (
              <Link key={r.id} href={`/music/archive/${encodeURIComponent(r.id)}`} className="group">
                <div className="relative aspect-square rounded-xl overflow-hidden bg-surface-2 border border-white/8 group-hover:border-violet-500/50 flex items-center justify-center">
                  <Disc3 className="w-8 h-8 text-slate-600" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.cover} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
                </div>
                <p className="mt-1.5 text-white text-sm font-semibold line-clamp-2 leading-snug">{r.title}</p>
                {r.year && <p className="text-slate-500 text-xs">{r.year}</p>}
              </Link>
            ))}
          </div>
        )}
        {/* Biografía: Wikipedia y MusicBrainz (país, años, géneros), si tienen al artista */}
        <MusicInfoPanel artist={{ name, albums: results?.length || undefined }} />
        <a
          href={`https://archive.org/search?query=${encodeURIComponent(`creator:"${name}"`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-white"
        >
          <ExternalLink className="w-3.5 h-3.5" /> Ver en archive.org
        </a>
      </div>
    </div>
  )
}
