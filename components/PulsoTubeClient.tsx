'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { Search, MonitorPlay, Loader2, X } from 'lucide-react'
import YoutubePlayer from '@/components/YoutubePlayer'
import { cachedJson } from '@/lib/client-cache'
import { useTubeStore } from '@/store/tubeStore'
import { useVideoStore } from '@/store/videoStore'
import { useMusicStore } from '@/store/musicStore'
import { ytIdOf } from '@/lib/pip'
import { songArtist } from '@/lib/library-radio'
import { toV, type V } from '@/lib/music-videos-data'
import { decodeEntities, type MusicVideo } from '@/lib/youtube-music'
import type { YouTubeSearchItem } from '@/lib/youtube'

// PulsoTube: busca videos mientras escribes, y si pegas un enlace de YouTube muestra ese video.
// Recomendaciones de lo que miraste, te gustó o escuchaste (nunca tendencias).

const norm = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const thumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`

/** Id de un video a partir de un enlace de YouTube (watch, youtu.be, shorts, music.youtube…) */
export function ytIdFromText(text: string): string | null {
  const m = text.trim().match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|music\.youtube\.com\/watch\?(?:.*&)?v=)([A-Za-z0-9_-]{11})/)
  return m ? m[1] : null
}

/** Lo que el usuario miró o le gustó (sin tendencias): ids y artistas para pedir recomendaciones */
function useTaste() {
  const watched = useTubeStore((s) => s.watched)
  const liked = useVideoStore((s) => s.liked)
  const later = useVideoStore((s) => s.watchLater)
  const history = useMusicStore((s) => s.history)
  const saved = useMusicStore((s) => s.saved)
  return useMemo(() => {
    const ids: string[] = []
    const artists = new Map<string, number>()
    const add = (id: string | null, artist?: string, w = 1) => {
      if (id && !ids.includes(id)) ids.push(id)
      if (artist) artists.set(artist, (artists.get(artist) ?? 0) + w)
    }
    watched.slice(0, 10).forEach((w) => add(w.id, w.channel, 3))
    liked.forEach((v) => add(v.id, v.channelTitle, 4))
    later.slice(0, 5).forEach((v) => add(v.id, v.channelTitle, 1))
    saved.slice(0, 20).forEach((t) => add(ytIdOf(t), songArtist(t), 4))
    history.slice(0, 20).forEach((h) => add(ytIdOf(h), h.artist || h.channelTitle, 2))
    const top = Array.from(artists.entries()).sort((a, b) => b[1] - a[1]).map((a) => a[0]).slice(0, 3)
    return { ids: ids.slice(0, 25), artists: top, watchedIds: new Set(watched.map((w) => w.id)) }
  }, [watched, liked, later, history, saved])
}

export default function PulsoTubeClient() {
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const [results, setResults] = useState<V[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [recs, setRecs] = useState<V[] | null>(null)
  const [playing, setPlaying] = useState<V | null>(null)
  const taste = useTaste()
  const addWatched = useTubeStore((s) => s.addWatched)
  const pastedId = ytIdFromText(q)

  // Recomendaciones de lo que te gusta (se piden una vez por sesión de cambios)
  const tasteKey = taste.ids.join(',') + '|' + taste.artists.join(',')
  useEffect(() => {
    if (!taste.ids.length && !taste.artists.length) return setRecs([])
    let alive = true
    const qs = new URLSearchParams()
    taste.ids.forEach((id) => qs.append('ids', id))
    taste.artists.forEach((a) => qs.append('artist', a))
    qs.set('genres', '2')
    cachedJson<{ videos?: MusicVideo[] }>(`/api/youtube/for-you?${qs.toString()}`, 6 * 3600_000, (d) => !!d?.videos?.length)
      .then((d) => {
        if (!alive) return
        setRecs(
          (d?.videos ?? [])
            .filter((v) => /^[A-Za-z0-9_-]{11}$/.test(v.id) && !taste.watchedIds.has(v.id))
            .map((v) => ({ id: v.id, title: decodeEntities(v.title), channel: decodeEntities(v.channelTitle || '') }))
        )
      })
      .catch(() => alive && setRecs([]))
    return () => {
      alive = false
    }
  }, [tasteKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Buscar en YouTube: cuando dejas de escribir medio segundo
  useEffect(() => {
    const t = q.trim()
    if (!t || pastedId) {
      setDebounced('')
      setResults(null)
      return
    }
    const id = setTimeout(() => setDebounced(t), 500)
    return () => clearTimeout(id)
  }, [q, pastedId])
  useEffect(() => {
    if (!debounced) return
    let alive = true
    setSearching(true)
    cachedJson<{ items?: YouTubeSearchItem[] }>(`/api/youtube/search?lang=todo&q=${encodeURIComponent(debounced)}`, 12 * 3600_000, (d) => !!d?.items?.length)
      .then((d) => alive && setResults((d?.items ?? []).filter((it) => it.id?.videoId).map(toV)))
      .catch(() => alive && setResults([]))
      .finally(() => alive && setSearching(false))
    return () => {
      alive = false
    }
  }, [debounced])

  // Filtro al instante sobre lo que ya se conoce (recomendaciones y lo visto)
  const watched = useTubeStore((s) => s.watched)
  const local = useMemo(() => {
    const n = norm(q.trim())
    if (!n) return []
    const pool: V[] = [...(recs ?? []), ...watched.map((w) => ({ id: w.id, title: w.title, channel: w.channel }))]
    const seen = new Set<string>()
    return pool.filter((v) => {
      if (seen.has(v.id)) return false
      seen.add(v.id)
      return norm(v.title).includes(n) || norm(v.channel).includes(n)
    })
  }, [q, recs, watched])

  // Lista que se ve (para pasar al siguiente video)
  const list: V[] = pastedId ? [] : q.trim() ? [...local, ...(results ?? []).filter((r) => !local.some((l) => l.id === r.id))] : recs ?? []

  const play = (v: V) => {
    addWatched({ id: v.id, title: v.title, channel: v.channel })
    setPlaying(v)
  }

  // Enlace de YouTube pegado: se abre ese video
  const openedRef = useRef('')
  useEffect(() => {
    if (!pastedId || openedRef.current === pastedId) return
    openedRef.current = pastedId
    let alive = true
    cachedJson<{ title?: string; channelTitle?: string }>(`/api/yt-info?id=${pastedId}`, 24 * 3600_000, (d) => !!d?.title)
      .then((d) => {
        if (!alive) return
        play({ id: pastedId, title: d?.title ? decodeEntities(d.title) : 'Video de YouTube', channel: d?.channelTitle ? decodeEntities(d.channelTitle) : '' })
      })
      .catch(() => alive && play({ id: pastedId, title: 'Video de YouTube', channel: '' }))
    return () => {
      alive = false
    }
  }, [pastedId]) // eslint-disable-line react-hooks/exhaustive-deps

  const next = () => {
    if (!playing) return
    const i = list.findIndex((v) => v.id === playing.id)
    const n = list[i + 1]
    if (n) play(n)
    else setPlaying(null)
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-10">
      <h1 className="flex items-center gap-2 text-2xl sm:text-3xl font-black text-white font-display">
        <MonitorPlay className="w-7 h-7 text-violet-300" /> PulsoTube
      </h1>
      <p className="text-slate-500 text-sm mt-1">Busca videos o pega un enlace de YouTube. Te recomendamos lo que miras y te gusta.</p>

      <div className="relative mt-5">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar videos o pegar un enlace de YouTube…"
          className="w-full rounded-full bg-surface-1 border border-white/10 focus:border-violet-400/60 outline-none pl-12 pr-11 py-3 text-white placeholder:text-slate-500"
          aria-label="Buscar en PulsoTube"
          inputMode="search"
          enterKeyHint="search"
        />
        {q && (
          <button onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-white" aria-label="Limpiar">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {pastedId && <p className="mt-4 text-sm text-slate-400">Enlace de YouTube detectado: abriendo el video…</p>}

      {q.trim() && !pastedId ? (
        <>
          {local.length > 0 && <Grid title="Coincidencias" items={local} onPlay={play} />}
          <div className="mt-6 flex items-center gap-2">
            <h2 className="text-white font-bold font-display">Resultados de YouTube</h2>
            {searching && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
          </div>
          {results && results.length > 0 ? <Grid items={results} onPlay={play} /> : !searching && results && <p className="mt-2 text-slate-500 text-sm">Sin resultados para «{q.trim()}».</p>}
        </>
      ) : (
        <>
          {recs === null && <p className="mt-8 flex items-center gap-2 text-slate-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Preparando tus recomendaciones…</p>}
          {recs && recs.length > 0 && <Grid title="Para ti" subtitle="Parecidos a lo que miraste y te gustó" items={recs} onPlay={play} />}
          {recs && recs.length === 0 && (
            <div className="mt-10 rounded-2xl border border-dashed border-white/10 p-8 text-center text-slate-400 text-sm">
              Mira videos o dales me gusta: aquí aparecerán recomendaciones de lo que te gusta.
            </div>
          )}
          {watched.length > 0 && <Grid title="Lo que miraste" items={watched.slice(0, 12).map((w) => ({ id: w.id, title: w.title, channel: w.channel }))} onPlay={play} />}
        </>
      )}

      {playing && (
        <YoutubePlayer
          key={playing.id}
          videoId={playing.id}
          title={playing.title}
          channelTitle={playing.channel}
          onClose={() => setPlaying(null)}
          onNext={next}
          upNext={list[list.findIndex((v) => v.id === playing.id) + 1]?.title}
        />
      )}
    </div>
  )
}

function Grid({ title, subtitle, items, onPlay }: { title?: string; subtitle?: string; items: V[]; onPlay: (v: V) => void }) {
  return (
    <section className="mt-8">
      {title && (
        <div className="mb-3">
          <h2 className="text-white font-bold font-display text-lg">{title}</h2>
          {subtitle && <p className="text-slate-500 text-xs">{subtitle}</p>}
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-5">
        {items.map((v) => (
          <button key={v.id} onClick={() => onPlay(v)} className="group text-left min-w-0">
            <div className="relative aspect-video rounded-xl overflow-hidden bg-surface-2">
              <Image src={thumb(v.id)} alt="" fill sizes="(max-width: 640px) 50vw, 25vw" className="object-cover group-hover:scale-105 transition-transform duration-500" unoptimized />
            </div>
            <p className="mt-2 text-sm font-semibold text-white line-clamp-2 leading-snug">{v.title}</p>
            <p className="text-xs text-slate-500 truncate">{v.channel}</p>
          </button>
        ))}
      </div>
    </section>
  )
}
