'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Play, Users, ListPlus, ChevronRight, Check, Heart } from 'lucide-react'
import { libraryMixes, type Mix } from '@/lib/community'
import { classifyLibrary } from '@/lib/library-radio'
import { useMusicStore } from '@/store/musicStore'
import { useOfflineStore } from '@/store/offlineStore'
import { usePlaylistStore } from '@/store/playlistStore'
import { markSource, usePlayingFrom } from '@/lib/shuffle-ui'
import type { MusicVideo } from '@/lib/youtube-music'
import CommunityShareButton from '@/components/CommunityShareButton'

// Biblioteca: playlists que se arman solas con tu música, una por género (Tu Rock, Tu Latina…).
// Se actualizan a medida que la app conoce el género de más artistas.
export default function LibraryMixesSection() {
  const [mixes, setMixes] = useState<Mix[]>([])
  const [saved, setSaved] = useState<string | null>(null)
  useEffect(() => {
    const refresh = () => setMixes(libraryMixes())
    refresh()
    const t = setTimeout(() => classifyLibrary().catch(() => {}), 1500)
    let pending: ReturnType<typeof setTimeout> | null = null
    const onGenres = () => {
      if (pending) return
      pending = setTimeout(() => {
        pending = null
        refresh()
      }, 2000)
    }
    window.addEventListener('cpn-genres', onGenres)
    return () => {
      clearTimeout(t)
      if (pending) clearTimeout(pending)
      window.removeEventListener('cpn-genres', onGenres)
    }
  }, [])

  const play = (m: Mix) => {
    const st = useMusicStore.getState()
    if (!st.shuffle) st.toggleShuffle()
    st.play(m.tracks, 0)
    markSource(`mix:${m.genre}`)
  }
  // Tus me gusta: solo las canciones a las que les diste ♥ (las más recientes primero)
  const likedRaw = useMusicStore((s) => s.saved)
  const liked = useMemo(() => [...likedRaw].sort((a, b) => b.savedAt - a.savedAt), [likedRaw])
  const playLiked = () => {
    if (!liked.length) return
    const st = useMusicStore.getState()
    if (st.shuffle) st.toggleShuffle()
    st.play(liked, 0)
    markSource('liked')
  }
  const keep = (m: Mix) => {
    usePlaylistStore.getState().create(`Mi ${m.label}`, m.tracks)
    setSaved(m.genre)
    setTimeout(() => setSaved(null), 2500)
  }

  return (
    <section className="mb-10">
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-white font-bold text-lg font-display">Mezclas de tu biblioteca</h2>
        <Link href="/music/comunidad" className="ml-auto inline-flex items-center gap-1 text-xs text-violet-300 font-semibold">
          <Users className="w-3.5 h-3.5" /> Comunidad <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      <p className="text-slate-400 text-xs mb-3">Se arman solas con tu música, por género. Puedes guardarlas como playlist o compartirlas.</p>
      {liked.length > 0 && (
        <div className="mb-3">
          <LikedCard tracks={liked} onPlay={playLiked} />
          <LikedList tracks={liked} />
        </div>
      )}
      {mixes.length === 0 ? (
        <p className="text-slate-500 text-sm rounded-2xl border border-dashed border-white/10 p-4">
          Guarda canciones en tu biblioteca: cuando la app conozca sus géneros aparecerán tus mezclas aquí.
        </p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x">
          {mixes.map((m) => {
            const covers = m.tracks.map((t) => t.thumbnail).filter((u) => u?.startsWith('http')).slice(0, 4)
            return (
              <div key={m.genre} className="w-40 shrink-0 snap-start">
                <MixCover sourceKey={`mix:${m.genre}`} onClick={() => play(m)} label={`Escuchar la mezcla ${m.label}`}>
                  <div className="grid grid-cols-2 grid-rows-2 w-full h-full opacity-80">
                    {covers.map((u, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={u} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ))}
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
                  <span className="absolute left-3 bottom-3 text-left">
                    <span className="block text-white font-bold font-display text-lg leading-tight">Tu {m.label}</span>
                    <span className="block text-white/70 text-[11px]">{m.tracks.length} canciones</span>
                  </span>
                </MixCover>
                <div className="mt-2 flex items-center gap-1.5">
                  <button
                    onClick={() => keep(m)}
                    className="w-9 h-9 rounded-full border border-white/10 bg-surface-1 text-slate-200 flex items-center justify-center"
                    aria-label={`Guardar la mezcla ${m.label} como playlist`}
                    title="Guardar como playlist"
                  >
                    {saved === m.genre ? <Check className="w-4 h-4 text-emerald-300" /> : <ListPlus className="w-4 h-4" />}
                  </button>
                  <CommunityShareButton shareKey={`mix-${m.genre}`} name={`Mezcla ${m.label}`} tracks={m.tracks} kind="mix" genre={m.genre} compact />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

/** Las canciones de Tus me gusta: se despliegan para elegir cualquiera o quitarle el ♥ */
function LikedList({ tracks }: { tracks: MusicVideo[] }) {
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState(60)
  const currentId = useMusicStore((s) => (s.isVisible ? s.queue[s.currentIndex]?.id : undefined))
  const offline = useOfflineStore((s) => s.items)
  const playFrom = (i: number) => {
    const st = useMusicStore.getState()
    if (st.shuffle) st.toggleShuffle()
    st.play(tracks, i)
    markSource('liked')
  }
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 text-violet-200 text-sm font-semibold px-1 py-1"
        aria-expanded={open}
      >
        <ChevronRight className={`w-4 h-4 transition-transform ${open ? 'rotate-90' : ''}`} />
        {open ? 'Ocultar canciones' : `Ver las ${tracks.length} canciones`}
      </button>
      {open && (
        <ul className="mt-1 divide-y divide-white/5 rounded-2xl bg-surface-1/60 border border-white/8">
          {tracks.slice(0, shown).map((t, i) => {
            const m = t.title.match(/^(.+?)\s[-–—]\s(.+)$/)
            const name = m ? m[2] : t.title
            const artist = (t as { artist?: string }).artist || (m ? m[1] : t.channelTitle)
            const isCurrent = t.id === currentId
            const down = !!(t.audioUrl && offline[t.audioUrl])
            return (
              <li key={t.id} className="flex items-center gap-3 px-3 py-2">
                <button onClick={() => playFrom(i)} className="min-w-0 flex-1 flex items-center gap-3 text-left">
                  <span className="w-11 h-11 rounded-lg overflow-hidden bg-surface-2 shrink-0">
                    {t.thumbnail && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.thumbnail} alt="" loading="lazy" className="w-full h-full object-cover" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-sm truncate ${isCurrent ? 'text-emerald-400 font-semibold' : 'text-white'}`}>{name}</span>
                    <span className="block text-slate-500 text-xs truncate">
                      {artist}
                      {down ? ' · descargada' : ''}
                    </span>
                  </span>
                </button>
                <button
                  onClick={() => useMusicStore.getState().toggleSaved(t)}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-purple-400 shrink-0"
                  aria-label={`Quitar ${name} de Me gusta`}
                  title="Quitar de Me gusta"
                >
                  <Heart className="w-4 h-4 fill-purple-400" />
                </button>
              </li>
            )
          })}
          {tracks.length > shown && (
            <li className="p-2 text-center">
              <button onClick={() => setShown((n) => n + 100)} className="text-violet-300 text-sm font-semibold px-4 py-2">
                Ver más ({tracks.length - shown})
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

/** Barritas de "está sonando" */
function Bars({ moving }: { moving: boolean }) {
  return (
    <span className="flex items-end gap-[3px] h-4" aria-hidden>
      {[0, 150, 300].map((d) => (
        <span key={d} className={`w-[3px] h-full bg-current rounded-full origin-bottom ${moving ? 'animate-eq' : 'scale-y-50'}`} style={{ animationDelay: `${d}ms` }} />
      ))}
    </span>
  )
}

/** Portada de una mezcla: si está sonando, se marca con barritas y un borde de color */
function MixCover({ sourceKey, onClick, label, children }: { sourceKey: string; onClick: () => void; label: string; children: React.ReactNode }) {
  const state = usePlayingFrom(sourceKey)
  return (
    <button
      onClick={onClick}
      className={`relative block w-40 h-40 rounded-2xl overflow-hidden bg-gradient-to-br from-violet-600 to-fuchsia-700 group ${state ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-obsidian' : ''}`}
      aria-label={label}
    >
      {children}
      <span className={`absolute right-2.5 bottom-2.5 w-10 h-10 rounded-full flex items-center justify-center shadow-lg ${state ? 'bg-emerald-500 text-white' : 'bg-white text-black'}`}>
        {state ? <Bars moving={state === 'playing'} /> : <Play className="w-4 h-4 fill-black ml-0.5" />}
      </span>
      {state && (
        <span className="absolute left-2.5 top-2.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5">{state === 'playing' ? 'Sonando' : 'En pausa'}</span>
      )}
    </button>
  )
}

/** Tus me gusta: las canciones con ♥ (no las de álbumes guardados) */
function LikedCard({ tracks, onPlay }: { tracks: MusicVideo[]; onPlay: () => void }) {
  const state = usePlayingFrom('liked')
  return (
    <button
      onClick={onPlay}
      className={`w-full flex items-center gap-3 rounded-2xl p-3 text-left bg-gradient-to-r from-violet-700 via-fuchsia-700 to-rose-600 ${state ? 'ring-2 ring-emerald-400' : ''}`}
      aria-label="Escuchar Tus me gusta"
    >
      <span className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
        <Heart className="w-6 h-6 text-white fill-white" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-white font-bold font-display">Tus me gusta</span>
        <span className="block text-white/80 text-xs">
          {tracks.length} {tracks.length === 1 ? 'canción' : 'canciones'} con ♥{state ? (state === 'playing' ? ' · sonando' : ' · en pausa') : ''}
        </span>
      </span>
      <span className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${state ? 'bg-emerald-500 text-white' : 'bg-white text-black'}`}>
        {state ? <Bars moving={state === 'playing'} /> : <Play className="w-5 h-5 fill-black ml-0.5" />}
      </span>
    </button>
  )
}
