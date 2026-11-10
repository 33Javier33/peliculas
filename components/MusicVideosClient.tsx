'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, PlayCircle, Loader2, MonitorPlay } from 'lucide-react'
import Link from 'next/link'
import YoutubePlayer from '@/components/YoutubePlayer'
import VideoAudioDownload from '@/components/VideoAudioDownload'
import HelpTip from '@/components/HelpTip'
import { continueInMiniPlayer, continueAsSong } from '@/lib/video-handoff'
import { useNextMusicVideo } from '@/lib/use-next-music-video'
import { decodeEntities } from '@/lib/youtube-music'
import { readSession, writeSession } from '@/lib/session-cache'
import type { YouTubeSearchItem } from '@/lib/youtube'
import { cachedJson } from '@/lib/client-cache'
import { artistVideoRows, searchVideos, useMyArtists, type V, toV } from '@/lib/music-videos-data'
import { useMusicStore } from '@/store/musicStore'
import { useFollowStore } from '@/store/followStore'
import { songArtist } from '@/lib/library-radio'
import type { CatalogArtist } from '@/lib/catalog'

// Videos musicales: géneros rápidos y buscador (siempre videos oficiales de música). Al terminar
// uno, sigue otro solo; se pueden mandar a la TV y bajar su audio.
const GENRES = [
  { id: 'estrenos', label: 'Estrenos', q: 'estreno video oficial 2026' },
  { id: 'pop', label: 'Pop', q: 'pop latino video oficial' },
  { id: 'urbano', label: 'Urbano', q: 'reggaeton video oficial' },
  { id: 'rock', label: 'Rock en español', q: 'rock en español video oficial' },
  { id: 'baladas', label: 'Baladas', q: 'balada romántica video oficial' },
  { id: 'cumbia', label: 'Cumbia', q: 'cumbia video oficial' },
  { id: 'salsa', label: 'Salsa', q: 'salsa video oficial' },
  { id: 'clasicos', label: 'Clásicos 80s y 90s', q: 'clásicos 80s 90s video oficial remasterizado' },
  { id: 'electronica', label: 'Electrónica', q: 'electronic music official video' },
  { id: 'ingles', label: 'En inglés', q: 'official music video' },
]

export default function MusicVideosClient() {
  // Opción elegida en «Explorar»: un artista tuyo, uno parecido o (sin biblioteca) un género
  const [genre, setGenre] = useState('')
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [items, setItems] = useState<V[] | null>(null)
  const [error, setError] = useState(false)
  const [open, setOpen] = useState<V | null>(null)
  // De dónde se abrió el video (para que al terminar siga con los de esa misma fila)
  const [openList, setOpenList] = useState<V[]>([])
  const play = (v: V, list: V[]) => {
    setOpenList(list)
    setOpen(v)
  }

  // Filas de tus artistas y de artistas parecidos
  const mine = useMyArtists()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const [rows, setRows] = useState<{ title: string; sub: string; items: V[] }[]>([])
  const [similarNames, setSimilarNames] = useState<string[]>([])
  const seeds = mine.slice(0, 4).join('|')
  useEffect(() => {
    if (!mounted || !seeds) return setRows([])
    let cancelled = false
    artistVideoRows(seeds.split('|'), mine, (r, similar) => {
      if (cancelled) return
      setRows(r)
      setSimilarNames(similar)
    })
    return () => {
      cancelled = true
    }
  }, [seeds, mounted]) // eslint-disable-line react-hooks/exhaustive-deps // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const s = readSession<{ genre: string; submitted: string }>('music-videos')
    // ?q=… (p. ej. «Ver videos de…» de un artista)
    const fromUrl = new URLSearchParams(window.location.search).get('q')
    if (fromUrl) {
      setSubmitted(fromUrl)
      setQuery(fromUrl)
    } else if (s) {
      setGenre(s.genre)
      setSubmitted(s.submitted)
      setQuery(s.submitted)
    }
  }, [])

  useEffect(() => {
    writeSession('music-videos', { genre, submitted })
    const chip = genre.startsWith('a:') || genre.startsWith('s:') ? `${genre.slice(2)} video oficial` : GENRES.find((g) => g.id === genre)?.q
    const q = submitted ? `${submitted} video oficial` : chip
    if (!q) {
      setItems([])
      return
    }
    let cancelled = false
    setItems(null)
    setError(false)
    searchVideos(q)
      .then((list) => {
        if (cancelled) return
        if (!list.length) setError(true)
        setItems(list)
      })
      .catch(() => !cancelled && (setError(true), setItems([])))
    return () => {
      cancelled = true
    }
  }, [genre, submitted])

  // «Explorar»: tus artistas y artistas parecidos (sin biblioteca: géneros)
  const chips = useMemo(
    () =>
      mine.length
        ? [
            ...mine.slice(0, 10).map((n) => ({ id: `a:${n}`, label: n, q: `${n} video oficial`, similar: false })),
            ...similarNames.filter((n) => !mine.slice(0, 10).includes(n)).map((n) => ({ id: `s:${n}`, label: n, q: `${n} video oficial`, similar: true })),
          ]
        : GENRES.map((g) => ({ ...g, similar: false })),
    [mine, similarNames]
  )
  // Sin biblioteca se parte con un género; con biblioteca, con las filas de tus artistas
  useEffect(() => {
    if (!mounted) return
    if (!mine.length && !genre) setGenre(GENRES[0].id)
    if (mine.length && GENRES.some((g) => g.id === genre)) setGenre('')
  }, [mounted, mine.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const { next, advance } = useNextMusicVideo(open, openList.length ? openList : items ?? [], useCallback((v: V) => setOpen(v), []))

  return (
    <div className="pt-20 bg-obsidian pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <h1 className="flex items-center gap-2 text-3xl font-black text-white font-display">
          <MonitorPlay className="w-7 h-7 text-violet-300" /> Videos musicales
          <HelpTip title="Videos musicales" text="Videos oficiales de música. Al terminar uno sigue otro solo. Puedes mandarlos a la TV, bajar su audio (sin video) o, al bloquear el teléfono, seguir escuchándolos." />
        </h1>
        <Link
          href="/music/feed"
          className="mt-3 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold bg-gradient-to-r from-cyan-500/20 via-violet-500/25 to-pink-500/25 border border-violet-400/35 text-white hover:border-violet-300/60"
        >
          <MonitorPlay className="w-4 h-4 text-violet-200" /> Videos para ti: a pantalla completa, de tus artistas y parecidos
        </Link>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setSubmitted(query.trim())
          }}
          className="relative mt-4"
          role="search"
        >
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar artista o canción…"
            aria-label="Buscar videos musicales"
            className="w-full bg-surface-1 border border-white/10 text-white placeholder-slate-500 rounded-full pl-11 pr-4 py-3 text-sm focus:outline-none focus:border-violet-400/70"
          />
        </form>
        {/* De tus artistas y de artistas parecidos (según tu biblioteca) */}
        {!submitted &&
          rows.map((r) => (
            <section key={r.title} className="mt-6">
              <h2 className="text-white font-bold text-lg font-display leading-tight">{r.title}</h2>
              <p className="text-slate-500 text-xs truncate mb-2">{r.sub}</p>
              <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">
                {r.items.slice(0, 12).map((v) => (
                  <div key={v.id} className="relative shrink-0 w-60">
                    <VideoAudioDownload compact id={v.id} title={v.title} channelTitle={v.channel} className="absolute top-2 right-2 z-[1]" />
                    <button onClick={() => play(v, r.items)} className="w-full text-left group">
                      <div className="relative aspect-video rounded-xl overflow-hidden bg-surface-2 border border-white/8">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`} alt="" loading="lazy" className="w-full h-full object-cover" />
                        <span className="absolute inset-0 flex items-center justify-center bg-black/15">
                          <PlayCircle className="w-10 h-10 text-white/90 drop-shadow" />
                        </span>
                      </div>
                      <p className="text-white text-sm font-semibold leading-snug line-clamp-2 mt-1.5">{v.title}</p>
                      <p className="text-slate-500 text-xs truncate">{v.channel}</p>
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))}

        {mine.length > 0 && <h2 className="mt-8 text-white font-bold text-lg font-display">Explorar tus artistas</h2>}
        {mine.length > 0 && <p className="text-slate-500 text-xs">Tus artistas y, en fucsia, artistas parecidos a los de tu biblioteca</p>}
        <div className="flex gap-2 overflow-x-auto mt-3 pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">
          {chips.map((g) => (
            <button
              key={g.id}
              onClick={() => {
                setSubmitted('')
                setQuery('')
                setGenre(genre === g.id ? '' : g.id)
              }}
              className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold ${
                !submitted && genre === g.id
                  ? 'bg-violet-500 text-white'
                  : g.similar
                    ? 'bg-fuchsia-500/10 border border-fuchsia-400/30 text-fuchsia-200'
                    : 'bg-surface-2/60 border border-white/8 text-slate-300'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>

        {!submitted && !genre ? null : items === null ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-slate-500 text-center py-20">{error ? 'No se pudieron cargar los videos. Intenta de nuevo en un momento.' : 'No se encontraron videos.'}</p>
        ) : (
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((v) => (
              <div key={v.id} className="relative">
                <VideoAudioDownload compact id={v.id} title={v.title} channelTitle={v.channel} className="absolute top-2 right-2 z-[1]" />
                <button onClick={() => play(v, items)} className="w-full text-left group">
                  <div className="relative aspect-video rounded-xl overflow-hidden bg-surface-2 border border-white/8">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/20">
                      <PlayCircle className="w-12 h-12 text-white/90 drop-shadow" />
                    </span>
                  </div>
                  <p className="text-white text-sm font-semibold leading-snug line-clamp-2 mt-2">{v.title}</p>
                  <p className="text-slate-500 text-xs truncate">{v.channel}</p>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      {open && (
        <YoutubePlayer
          key={open.id}
          videoId={open.id}
          title={open.title}
          channelTitle={open.channel}
          onNext={next ? advance : undefined}
          upNext={next?.title}
          autoNext
          songToggle
          onSong={(t) => {
            continueAsSong({ id: open.id, title: open.title, channelTitle: open.channel }, t)
            setOpen(null)
          }}
          onTrackChange={() => setOpen(null)}
          onClose={(t) => {
            // Sigue en la ventana chica del reproductor desde el mismo segundo
            continueInMiniPlayer({ id: open.id, title: open.title, channelTitle: open.channel }, t)
            setOpen(null)
          }}
        />
      )}
    </div>
  )
}
