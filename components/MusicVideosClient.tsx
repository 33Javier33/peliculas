'use client'

import { useCallback, useEffect, useState } from 'react'
import { Search, PlayCircle, Loader2, MonitorPlay } from 'lucide-react'
import YoutubePlayer from '@/components/YoutubePlayer'
import VideoAudioDownload from '@/components/VideoAudioDownload'
import HelpTip from '@/components/HelpTip'
import { continueInMiniPlayer } from '@/lib/video-handoff'
import { useNextMusicVideo } from '@/lib/use-next-music-video'
import { decodeEntities } from '@/lib/youtube-music'
import { readSession, writeSession } from '@/lib/session-cache'
import type { YouTubeSearchItem } from '@/lib/youtube'

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

type V = { id: string; title: string; channel: string }

export default function MusicVideosClient() {
  const [genre, setGenre] = useState('estrenos')
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [items, setItems] = useState<V[] | null>(null)
  const [error, setError] = useState(false)
  const [open, setOpen] = useState<V | null>(null)

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
    const q = submitted ? `${submitted} video oficial` : GENRES.find((g) => g.id === genre)?.q || GENRES[0].q
    let cancelled = false
    setItems(null)
    setError(false)
    fetch(`/api/youtube/search?lang=todo&q=${encodeURIComponent(q)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { items?: YouTubeSearchItem[] }) => {
        if (cancelled) return
        setItems(
          (d.items ?? [])
            .filter((it) => it.id?.videoId)
            .map((it) => ({ id: it.id.videoId, title: decodeEntities(it.snippet.title), channel: decodeEntities(it.snippet.channelTitle) }))
        )
      })
      .catch(() => !cancelled && (setError(true), setItems([])))
    return () => {
      cancelled = true
    }
  }, [genre, submitted])

  const { next, advance } = useNextMusicVideo(open, items ?? [], useCallback((v: V) => setOpen(v), []))

  return (
    <div className="pt-20 min-h-screen bg-obsidian pb-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <h1 className="flex items-center gap-2 text-3xl font-black text-white font-display">
          <MonitorPlay className="w-7 h-7 text-violet-300" /> Videos musicales
          <HelpTip title="Videos musicales" text="Videos oficiales de música. Al terminar uno sigue otro solo. Puedes mandarlos a la TV, bajar su audio (sin video) o, al bloquear el teléfono, seguir escuchándolos." />
        </h1>
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
        <div className="flex gap-2 overflow-x-auto mt-4 pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">
          {GENRES.map((g) => (
            <button
              key={g.id}
              onClick={() => {
                setSubmitted('')
                setQuery('')
                setGenre(g.id)
              }}
              className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold ${!submitted && genre === g.id ? 'bg-violet-500 text-white' : 'bg-surface-2/60 border border-white/8 text-slate-300'}`}
            >
              {g.label}
            </button>
          ))}
        </div>

        {items === null ? (
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
                <button onClick={() => setOpen(v)} className="w-full text-left group">
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
