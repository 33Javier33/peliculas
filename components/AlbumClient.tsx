'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Play, Shuffle, Heart, Loader2, ChevronLeft, AlertCircle } from 'lucide-react'
import { useMusicStore } from '@/store/musicStore'
import type { CatalogAlbumDetail } from '@/lib/catalog'
import type { MusicVideo } from '@/lib/youtube-music'
import BackButton from '@/components/BackButton'
import MusicInfoPanel from '@/components/MusicInfoPanel'

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function totalLabel(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return h > 0 ? `${h} h ${m} min` : `${m} min`
}

const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

const TYPE_LABEL: Record<string, string> = { album: 'Álbum', single: 'Sencillo', ep: 'EP', compile: 'Recopilatorio' }

export default function AlbumClient({ album }: { album: CatalogAlbumDetail }) {
  const { play, queue, currentIndex, isPlaying, isVisible, shuffle, toggleShuffle, saved, saveTrack } = useMusicStore()
  // Al abrir el álbum ya se puede reproducir: cada canción busca su video justo antes de sonar.
  // Mientras tanto se piden todas ya listas (si llegan antes de tocar Reproducir, se usan esas).
  const pendingTracks = useMemo<MusicVideo[]>(
    () =>
      album.trackList.map((t) => ({
        id: `dz-${t.id}`,
        title: `${t.artist || album.artist.name} - ${t.title}`,
        channelTitle: t.artist || album.artist.name,
        thumbnail: album.cover,
        publishedAt: album.year || '',
        description: album.title,
        duration: formatDuration(t.duration),
        album: album.title,
        pending: { artist: t.artist || album.artist.name, title: t.title, duration: t.duration },
      })),
    [album]
  )
  const [resolved, setResolved] = useState<MusicVideo[] | null>(null)
  const playable = resolved ?? (pendingTracks.length ? pendingTracks : null)
  const status = (playable ? 'ready' : 'error') as 'loading' | 'ready' | 'error'
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Se preparan las canciones (IDs de YouTube) al abrir el álbum, para que "Reproducir" sea inmediato
  useEffect(() => {
    let cancelled = false
    fetch(`/api/catalog/album/${album.id}/play`)
      .then((r) => (r.ok ? r.json() : { tracks: [] }))
      .then((d: { tracks?: MusicVideo[] }) => {
        if (!cancelled && d.tracks?.length) setResolved(d.tracks)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [album.id])

  const current = isVisible ? queue[currentIndex] : undefined
  // Por título: las pendientes cambian de ID al encontrar su video
  const playableTitles = new Set(playable?.map((t) => t.title))
  const isAlbumPlaying = !!current && playableTitles.has(current.title)

  // Índice reproducible de una canción del álbum (por título; si no, por posición)
  const indexOf = (title: string, position: number) => {
    if (!playable) return -1
    const wanted = normalize(title)
    const byTitle = playable.findIndex((t) => normalize(t.title).endsWith(wanted))
    return byTitle >= 0 ? byTitle : Math.min(position - 1, playable.length - 1)
  }

  const playFrom = (idx: number) => {
    if (playable && playable.length > 0) play(playable, Math.max(0, idx))
  }

  const playShuffled = () => {
    if (!playable?.length) return
    if (!shuffle) toggleShuffle()
    play(playable, Math.floor(Math.random() * playable.length))
  }

  const savedIds = new Set(mounted ? saved.map((t) => t.id) : [])
  // Para guardar en la biblioteca hacen falta los videos ya encontrados
  const allSaved = !!resolved?.length && resolved.every((t) => savedIds.has(t.id))
  const saveAlbum = () => resolved?.forEach((t) => saveTrack(t))

  return (
    <div className="relative min-h-screen pt-20 pb-32 overflow-hidden">
      {/* Luz ambiental con la portada */}
      {album.cover && (
        <div className="absolute inset-x-0 top-0 h-[520px] pointer-events-none" aria-hidden>
          <Image src={album.cover} alt="" fill sizes="100vw" className="object-cover blur-3xl opacity-35 scale-125" />
          <div className="absolute inset-0 bg-gradient-to-b from-obsidian/30 via-obsidian/80 to-obsidian" />
        </div>
      )}

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <BackButton
          fallbackHref={album.artist.id ? `/music/artist/${album.artist.id}` : '/music'}
          className="inline-flex items-center gap-1 text-slate-300 hover:text-white text-sm mb-5"
        >
          <ChevronLeft className="w-4 h-4" /> Volver
        </BackButton>

        <div className="flex flex-col sm:flex-row sm:items-end gap-5 sm:gap-8">
          <div className="relative w-56 sm:w-64 aspect-square mx-auto sm:mx-0 rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(139,92,246,0.35)] border border-white/10 bg-surface-2 shrink-0">
            {album.cover && <Image src={album.cover} alt={album.title} fill sizes="256px" className="object-cover" priority />}
          </div>
          <div className="min-w-0 text-center sm:text-left">
            <p className="text-emerald-400 text-[11px] font-bold uppercase tracking-[0.08em] font-display">
              {TYPE_LABEL[album.type || 'album'] || 'Álbum'}
            </p>
            <h1 className="text-white text-[28px] leading-[34px] sm:text-[40px] sm:leading-[46px] font-extrabold mt-1">{album.title}</h1>
            <p className="text-slate-300 text-sm mt-2">
              {album.artist.id ? (
                <Link href={`/music/artist/${album.artist.id}`} className="font-semibold text-white hover:text-violet-300">
                  {album.artist.name}
                </Link>
              ) : (
                album.artist.name
              )}
              {album.year && <> · {album.year}</>} · {album.trackList.length} canciones · {totalLabel(album.duration)}
            </p>
            {album.genres.length > 0 && <p className="text-slate-500 text-xs mt-1">{album.genres.join(' · ')}</p>}
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center justify-center sm:justify-start gap-3 mt-6">
          <button
            onClick={() => playFrom(0)}
            disabled={status !== 'ready'}
            className="inline-flex items-center gap-2 bg-violet-300 hover:bg-violet-200 disabled:opacity-60 text-violet-950 font-extrabold font-display px-6 py-3 rounded-full shadow-[0_8px_32px_rgba(139,92,246,0.5)] transition-colors"
          >
            {status === 'loading' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-violet-950" />}
            {status === 'loading' ? 'Preparando…' : 'Reproducir'}
          </button>
          <button
            onClick={playShuffled}
            disabled={status !== 'ready'}
            className="w-12 h-12 rounded-full bg-surface-2/80 border border-white/10 flex items-center justify-center text-emerald-400 disabled:opacity-50"
            aria-label="Reproducir en aleatorio"
            title="Aleatorio"
          >
            <Shuffle className="w-5 h-5" />
          </button>
          <button
            onClick={saveAlbum}
            disabled={!resolved || allSaved}
            className={`w-12 h-12 rounded-full border flex items-center justify-center disabled:cursor-default ${
              allSaved ? 'bg-violet-500/20 border-violet-400/40 text-violet-300' : 'bg-surface-2/80 border-white/10 text-slate-200'
            } ${status !== 'ready' ? 'opacity-50' : ''}`}
            aria-label={allSaved ? 'Álbum guardado en tu biblioteca' : 'Guardar álbum en mi biblioteca'}
            title={allSaved ? 'Guardado en tu biblioteca' : 'Guardar en mi biblioteca'}
          >
            <Heart className={`w-5 h-5 ${allSaved ? 'fill-violet-300' : ''}`} />
          </button>
        </div>

        {status === 'error' && (
          <div className="mt-5 flex items-start gap-3 bg-surface-1 border border-white/8 rounded-xl px-4 py-3 text-sm text-slate-300">
            <AlertCircle className="w-5 h-5 text-violet-300 shrink-0" />
            No pudimos encontrar el audio de este álbum ahora. Intenta de nuevo en unos minutos.
          </div>
        )}

        {/* Canciones */}
        <ol className="mt-8 divide-y divide-white/5 border border-white/5 rounded-2xl overflow-hidden bg-surface-1/50">
          {album.trackList.map((t) => {
            const idx = indexOf(t.title, t.position)
            const isCurrent = isAlbumPlaying && idx >= 0 && playable?.[idx]?.title === current?.title
            return (
              <li key={t.id}>
                <button
                  onClick={() => playFrom(idx)}
                  disabled={status !== 'ready'}
                  className={`w-full flex items-center gap-3 px-3 sm:px-4 py-3 text-left transition-colors ${
                    isCurrent ? 'bg-violet-500/15' : 'hover:bg-white/5'
                  }`}
                >
                  <span className="w-6 text-center text-xs text-slate-500 tabular-nums shrink-0">
                    {isCurrent && isPlaying ? (
                      <span className="inline-flex items-end gap-[2px] h-3.5">
                        {[0, 150, 300].map((d) => (
                          <span key={d} className="w-[3px] h-full bg-emerald-400 rounded-full origin-bottom animate-eq" style={{ animationDelay: `${d}ms` }} />
                        ))}
                      </span>
                    ) : (
                      t.position
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-semibold font-display truncate ${isCurrent ? 'text-emerald-400' : 'text-white'}`}>
                      {t.title}
                    </span>
                    {t.artist && t.artist !== album.artist.name && <span className="block text-xs text-slate-500 truncate">{t.artist}</span>}
                  </span>
                  <span className="text-xs text-slate-500 font-mono shrink-0">{formatDuration(t.duration)}</span>
                </button>
              </li>
            )
          })}
        </ol>

        <MusicInfoPanel
          artist={{ id: album.artist.id || undefined, name: album.artist.name, picture: album.artistPicture }}
          album={{
            title: album.title,
            type: album.type,
            releaseDate: album.releaseDate,
            label: album.label,
            genres: album.genres,
            tracks: album.trackList.length,
            duration: album.duration,
            fans: album.fans,
          }}
        />

        {album.label && <p className="text-slate-600 text-xs mt-4">℗ {album.label}</p>}
        <p className="text-slate-600 text-xs mt-1">Información del álbum: Deezer · Audio: YouTube</p>
      </div>
    </div>
  )
}
