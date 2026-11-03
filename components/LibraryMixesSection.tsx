'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Play, Users, ListPlus, ChevronRight, Check } from 'lucide-react'
import { libraryMixes, type Mix } from '@/lib/community'
import { classifyLibrary } from '@/lib/library-radio'
import { useMusicStore } from '@/store/musicStore'
import { usePlaylistStore } from '@/store/playlistStore'
import { markShuffle } from '@/lib/shuffle-ui'
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
    markShuffle(`mix:${m.genre}`)
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
                <button onClick={() => play(m)} className="relative block w-40 h-40 rounded-2xl overflow-hidden bg-gradient-to-br from-violet-600 to-fuchsia-700 group" aria-label={`Escuchar la mezcla ${m.label}`}>
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
                  <span className="absolute right-2.5 bottom-2.5 w-10 h-10 rounded-full bg-white text-black flex items-center justify-center shadow-lg">
                    <Play className="w-4 h-4 fill-black ml-0.5" />
                  </span>
                </button>
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
