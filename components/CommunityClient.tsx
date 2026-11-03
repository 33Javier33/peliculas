'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Users, Play, Shuffle, ListPlus, Loader2, Check, Trash2, Disc3 } from 'lucide-react'
import type { MusicVideo } from '@/lib/youtube-music'
import { useMusicStore } from '@/store/musicStore'
import { usePlaylistStore } from '@/store/playlistStore'
import { useAccountStore } from '@/store/accountStore'
import { myShared, unpublish, readAlias, type MyShared } from '@/lib/community'
import { markShuffle } from '@/lib/shuffle-ui'

// Comunidad de playlists: mezclas por género hechas con lo que comparten todos, las playlists
// compartidas (con el nombre público de quien las subió) y lo que compartiste tú.

interface SharedInfo {
  id: string
  alias: string
  name: string
  genre: string
  kind: string
  count: number
  cover?: string
  updated: number
}
interface MixInfo {
  genre: string
  label: string
  count: number
  cover?: string
}

export default function CommunityClient() {
  const [data, setData] = useState<{ playlists: SharedInfo[]; mixes: MixInfo[]; unavailable?: boolean } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [mine, setMine] = useState<MyShared[] | null>(null)
  const token = useAccountStore((s) => s.token)
  const [alias, setAlias] = useState('')
  useEffect(() => setAlias(readAlias()), [])

  const load = useCallback(() => {
    fetch('/api/comunidad')
      .then((r) => r.json())
      .then((d) => setData({ playlists: d.playlists ?? [], mixes: d.mixes ?? [], unavailable: d.error === 'unavailable' }))
      .catch(() => setData({ playlists: [], mixes: [], unavailable: true }))
  }, [])
  useEffect(load, [load])
  useEffect(() => {
    if (token) myShared().then(setMine)
    else setMine(null)
  }, [token])

  const tracksOf = async (q: string): Promise<{ name: string; tracks: MusicVideo[] } | null> => {
    const d = await fetch(`/api/comunidad?${q}`).then((r) => r.json()).catch(() => null)
    if (d?.playlist) return { name: d.playlist.name, tracks: d.playlist.tracks }
    if (d?.mix) return { name: `Mezcla ${d.mix.label} de la comunidad`, tracks: d.mix.tracks }
    return null
  }
  const run = async (key: string, q: string, what: 'play' | 'shuffle' | 'save') => {
    setBusy(`${key}:${what}`)
    const r = await tracksOf(q)
    setBusy(null)
    if (!r?.tracks.length) return
    const st = useMusicStore.getState()
    if (what === 'save') {
      usePlaylistStore.getState().create(r.name, r.tracks)
      setSavedId(key)
      setTimeout(() => setSavedId(null), 2500)
      return
    }
    if ((what === 'shuffle') !== st.shuffle) st.toggleShuffle()
    st.play(r.tracks, 0)
    if (what === 'shuffle') markShuffle(`community:${key}`)
  }
  const remove = async (p: MyShared) => {
    if (!p.key) return
    setBusy(`rm:${p.id}`)
    await unpublish(p.key)
    setBusy(null)
    setMine((m) => m?.filter((x) => x.id !== p.id) ?? null)
    load()
  }

  const icon = (key: string, what: string, el: React.ReactNode) => (busy === `${key}:${what}` ? <Loader2 className="w-4 h-4 animate-spin" /> : el)

  return (
    <div className="pt-24 pb-40 px-4 max-w-5xl mx-auto min-h-screen">
      <Link href="/music/library" className="text-slate-400 text-sm hover:text-white">
        ← Biblioteca
      </Link>
      <h1 className="mt-4 flex items-center gap-3 text-3xl font-bold text-white font-display">
        <Users className="w-7 h-7 text-violet-300" /> Comunidad
      </h1>
      <p className="mt-2 text-slate-400 text-sm max-w-xl">
        Playlists y mezclas que comparten quienes usan la app. Para compartir las tuyas: en una playlist o en «Mezclas de tu biblioteca» toca
        «Compartir en la comunidad». Se muestra tu nombre público{alias ? ` (${alias})` : ''}, nunca tu correo.
      </p>

      {!data && (
        <p className="mt-8 flex items-center gap-2 text-slate-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando la comunidad…
        </p>
      )}
      {data?.unavailable && (
        <p className="mt-8 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-amber-200 text-sm">
          La comunidad todavía no está activada en el servidor de cuentas. Cuando se active, aquí aparecerán las playlists compartidas.
        </p>
      )}

      {data && !data.unavailable && (
        <div className="mt-8 space-y-10">
          <section>
            <h2 className="text-white text-xl font-bold mb-1">Mezclas de la comunidad</h2>
            <p className="text-slate-400 text-xs mb-3">Lo que todos compartieron, mezclado por género. Cambian a medida que se comparte más.</p>
            {data.mixes.length === 0 ? (
              <p className="text-slate-500 text-sm">Todavía no hay suficientes canciones compartidas para armar mezclas.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {data.mixes.map((m) => (
                  <div key={m.genre} className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-fuchsia-700 to-violet-800 aspect-square">
                    {m.cover && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.cover} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" loading="lazy" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 to-transparent" />
                    <div className="absolute left-3 bottom-3 right-3">
                      <p className="text-white font-bold font-display text-lg leading-tight">{m.label}</p>
                      <p className="text-white/70 text-[11px]">{m.count} canciones de la comunidad</p>
                      <div className="mt-2 flex gap-1.5">
                        <button onClick={() => run(`mix-${m.genre}`, `mix=${m.genre}`, 'shuffle')} className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center" aria-label={`Escuchar la mezcla ${m.label}`}>
                          {icon(`mix-${m.genre}`, 'shuffle', <Play className="w-4 h-4 fill-black ml-0.5" />)}
                        </button>
                        <button onClick={() => run(`mix-${m.genre}`, `mix=${m.genre}`, 'save')} className="w-9 h-9 rounded-full bg-black/40 border border-white/20 text-white flex items-center justify-center" aria-label={`Guardar la mezcla ${m.label}`}>
                          {savedId === `mix-${m.genre}` ? <Check className="w-4 h-4 text-emerald-300" /> : icon(`mix-${m.genre}`, 'save', <ListPlus className="w-4 h-4" />)}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-white text-xl font-bold mb-3">Playlists compartidas</h2>
            {data.playlists.length === 0 ? (
              <p className="text-slate-500 text-sm">Nadie ha compartido playlists todavía. ¡Sé el primero!</p>
            ) : (
              <ul className="divide-y divide-white/5 rounded-2xl bg-surface-1/60 border border-white/8">
                {data.playlists.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 p-3">
                    <span className="w-14 h-14 rounded-xl overflow-hidden bg-surface-2 shrink-0 flex items-center justify-center">
                      {p.cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.cover} alt="" className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <Disc3 className="w-6 h-6 text-slate-500" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-white text-sm font-semibold truncate">{p.name}</span>
                      <span className="block text-slate-400 text-xs truncate">
                        de {p.alias} · {p.count} canciones{p.kind === 'mix' ? ' · mezcla' : ''}
                      </span>
                    </span>
                    <button onClick={() => run(p.id, `id=${p.id}`, 'play')} className="w-9 h-9 rounded-full bg-violet-500 text-white flex items-center justify-center shrink-0" aria-label={`Escuchar ${p.name}`}>
                      {icon(p.id, 'play', <Play className="w-4 h-4 fill-white ml-0.5" />)}
                    </button>
                    <button onClick={() => run(p.id, `id=${p.id}`, 'shuffle')} className="w-9 h-9 rounded-full border border-white/10 text-slate-200 flex items-center justify-center shrink-0" aria-label={`${p.name} en aleatorio`}>
                      {icon(p.id, 'shuffle', <Shuffle className="w-4 h-4" />)}
                    </button>
                    <button onClick={() => run(p.id, `id=${p.id}`, 'save')} className="w-9 h-9 rounded-full border border-white/10 text-slate-200 flex items-center justify-center shrink-0" aria-label={`Guardar ${p.name} en tus playlists`}>
                      {savedId === p.id ? <Check className="w-4 h-4 text-emerald-300" /> : icon(p.id, 'save', <ListPlus className="w-4 h-4" />)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {mine && mine.length > 0 && (
            <section>
              <h2 className="text-white text-xl font-bold mb-3">Lo que compartiste</h2>
              <ul className="divide-y divide-white/5 rounded-2xl bg-surface-1/60 border border-white/8">
                {mine.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 p-3">
                    <span className="min-w-0 flex-1">
                      <span className="block text-white text-sm font-semibold truncate">{p.name}</span>
                      <span className="block text-slate-400 text-xs">{p.tracks.length} canciones</span>
                    </span>
                    <button onClick={() => remove(p)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-rose-400/40 text-rose-300 text-xs font-semibold" aria-label={`Dejar de compartir ${p.name}`}>
                      {busy === `rm:${p.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Dejar de compartir
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
