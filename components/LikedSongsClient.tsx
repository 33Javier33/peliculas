'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { Heart, Play, Shuffle, ArrowLeft, Sparkles, Loader2 } from 'lucide-react'
import BackButton from '@/components/BackButton'
import { useMusicStore } from '@/store/musicStore'
import { TrackStateOverlay } from '@/components/TrackState'
import TrackTable from '@/components/TrackTable'
import { songArtist } from '@/lib/library-radio'
import { withoutBlocked, isArtistBlocked, useBlockedVersion } from '@/store/blockStore'
import { smartShuffle, fisherYates } from '@/lib/smart-shuffle'
import { cachedJson } from '@/lib/client-cache'
import type { MusicVideo } from '@/lib/youtube-music'

type Top = { id: string; title: string; channel: string; thumbnail: string; views: number }
const PER_ARTIST = 3
const MAX_ARTISTS = 15

// Tus me gusta como un disco: reproducir, aleatorio, tocar una canción o quitarle el ♥
export default function LikedSongsClient() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const saved = useMusicStore((s) => s.saved)
  const blockedVersion = useBlockedVersion()
  // Lo oculto («No me interesa») no se muestra ni suena (sigue guardado: se recupera en Configuración)
  const list = useMemo(() => withoutBlocked([...saved].sort((a, b) => b.savedAt - a.savedAt)), [saved, blockedVersion]) // eslint-disable-line react-hooks/exhaustive-deps
  const playAt = (i: number, shuffle = false) => {
    const st = useMusicStore.getState()
    if (shuffle !== st.shuffle) st.toggleShuffle()
    st.play(list, shuffle ? Math.floor(Math.random() * list.length) : i)
  }
  // Mezcla de tus artistas: de cada artista de tus me gusta, sus temas más reproducidos, al azar.
  // Suena apenas llega el primer artista; los demás se van sumando (mezclados) a la cola.
  const [mixing, setMixing] = useState(false)
  const artists = useMemo(() => {
    const count = new Map<string, number>()
    for (const t of list) {
      const a = songArtist(t)?.trim()
      if (a && !isArtistBlocked(a)) count.set(a, (count.get(a) ?? 0) + 1)
    }
    return Array.from(count.entries()).sort((a, b) => b[1] - a[1]).map(([a]) => a).slice(0, MAX_ARTISTS)
  }, [list])
  const playArtistMix = async () => {
    if (mixing || !artists.length) return
    setMixing(true)
    let started = false
    const seen = new Set<string>()
    await Promise.all(
      fisherYates(artists).map(async (name) => {
        const d = await cachedJson<{ tracks?: Top[] }>(`/api/artist-top?name=${encodeURIComponent(name)}`, 12 * 3600_000, (x) => !!x?.tracks?.length).catch(() => null)
        const tracks: MusicVideo[] = (d?.tracks ?? [])
          .filter((t) => !seen.has(t.id) && seen.add(t.id))
          .slice(0, PER_ARTIST)
          .map((t) => ({ id: t.id, title: t.title, channelTitle: t.channel, thumbnail: t.thumbnail, publishedAt: '', description: '', artist: name }) as MusicVideo)
        if (!tracks.length) return
        const st = useMusicStore.getState()
        if (!started) {
          started = true
          if (!st.shuffle) st.toggleShuffle()
          st.play(smartShuffle(tracks), 0)
          setMixing(false)
        } else st.appendToQueue(tracks)
      })
    )
    setMixing(false)
  }
  if (!mounted) return <div className="pt-20 min-h-screen bg-obsidian" />
  return (
    <div className="pt-20 bg-obsidian pb-8">
      <div className="max-w-3xl lg:max-w-none mx-auto px-4 lg:px-8 py-6">
        <BackButton fallbackHref="/music" className="inline-flex items-center gap-1.5 text-slate-500 hover:text-violet-400 text-xs font-medium">
          <ArrowLeft className="w-3.5 h-3.5" /> Volver
        </BackButton>
        <div className="mt-4 flex items-end gap-4 lg:gap-6 lg:-mx-8 lg:px-8 lg:pt-6 lg:pb-6 lg:bg-gradient-to-b lg:from-violet-700/40 lg:to-transparent">
          <span className="w-28 h-28 lg:w-56 lg:h-56 rounded-xl lg:rounded-md cpn-keep bg-gradient-to-br from-violet-600 to-cyan-300 flex items-center justify-center shrink-0 shadow-lg lg:shadow-2xl">
            <Heart className="w-12 h-12 lg:w-24 lg:h-24 text-white fill-white" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-violet-300">Playlist</p>
            <h1 className="text-3xl lg:text-7xl font-black text-white font-display lg:tracking-tight lg:my-3">Tus me gusta</h1>
            <p className="text-slate-400 text-sm">{list.length} {list.length === 1 ? 'canción' : 'canciones'}</p>
          </div>
        </div>
        {list.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button onClick={() => playAt(0)} className="inline-flex items-center gap-2 bg-violet-500 text-white font-bold px-5 py-2.5 rounded-full text-sm">
              <Play className="w-4 h-4 fill-white" /> Reproducir
            </button>
            <button onClick={() => playAt(0, true)} className="inline-flex items-center gap-2 bg-surface-1 border border-white/10 text-white font-semibold px-4 py-2.5 rounded-full text-sm">
              <Shuffle className="w-4 h-4" /> Aleatorio
            </button>
            {artists.length > 0 && (
              <button
                onClick={playArtistMix}
                disabled={mixing}
                title="Los temas más reproducidos de cada artista de tus me gusta, en aleatorio"
                className="inline-flex items-center gap-2 bg-surface-1 border border-violet-400/30 text-violet-100 font-semibold px-4 py-2.5 rounded-full text-sm disabled:opacity-70"
              >
                {mixing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Mezcla de tus artistas
              </button>
            )}
          </div>
        )}
        {list.length === 0 ? (
          <p className="mt-10 text-slate-500 text-sm text-center">Toca el ♥ en cualquier canción para guardarla aquí.</p>
        ) : (
          <>
          {/* Computador: tabla como Spotify (con la fecha en que la agregaste) */}
          <div className="hidden lg:block mt-6">
            <TrackTable tracks={list} onPlay={(i) => playAt(i)} dateOf={(t) => t.savedAt} />
          </div>
          <ul className="lg:hidden mt-5 divide-y divide-white/5 border border-white/5 rounded-xl overflow-hidden">
            {list.map((t, i) => (
              <li key={t.id} className="flex items-center gap-3 px-3 py-2 hover:bg-white/5">
                <button onClick={() => playAt(i)} className="flex items-center gap-3 min-w-0 flex-1 text-left">
                  <span className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-surface-2">
                    {t.thumbnail && <Image src={t.thumbnail} alt="" fill sizes="48px" className="object-cover" />}
                    <TrackStateOverlay id={t.id} size="sm" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-white text-sm font-semibold truncate">{t.title.replace(/^[^-–]+[-–]\s*/, '') || t.title}</span>
                    <span className="block text-slate-500 text-xs truncate">{t.artist || t.channelTitle}</span>
                  </span>
                </button>
                <button onClick={() => useMusicStore.getState().toggleSaved(t)} className="p-2 text-purple-400" aria-label="Quitar de Me gusta" title="Quitar de Me gusta">
                  <Heart className="w-4 h-4 fill-purple-400" />
                </button>
              </li>
            ))}
          </ul>
          </>
        )}
      </div>
    </div>
  )
}
