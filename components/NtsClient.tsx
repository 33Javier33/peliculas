'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Play, Pause, Radio, MapPin, ChevronRight, Loader2 } from 'lucide-react'
import type { NtsChannel, NtsMixtape, NtsShow } from '@/lib/nts'
import type { MusicVideo } from '@/lib/youtube-music'
import { useMusicStore } from '@/store/musicStore'

// NTS Radio (Londres): dos canales en vivo y 16 Infinite Mixtapes, con el mismo reproductor de
// la app (sigue en segundo plano, notificación, widget…).

export interface NtsData {
  live: NtsChannel[]
  mixtapes: NtsMixtape[]
}

/** Datos de NTS (se actualizan cada minuto mientras la página está abierta) */
export function useNts(): NtsData | null | 'error' {
  const [data, setData] = useState<NtsData | null | 'error'>(null)
  useEffect(() => {
    let cancelled = false
    const load = () =>
      fetch('/api/nts')
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d: NtsData) => !cancelled && setData(d))
        .catch(() => !cancelled && setData((prev) => (prev && prev !== 'error' ? prev : 'error')))
    load()
    const iv = setInterval(load, 60000)
    return () => {
      cancelled = true
      clearInterval(iv)
    }
  }, [])
  return data
}

export const liveTrack = (c: NtsChannel): MusicVideo => ({
  id: `nts-live-${c.id}`,
  title: c.now.title,
  channelTitle: `NTS ${c.id} · En vivo desde Londres`,
  thumbnail: c.now.picture || '/icons/icon-512.png',
  publishedAt: '',
  description: '',
  streamUrl: c.stream,
})

export const mixtapeTrack = (m: NtsMixtape): MusicVideo => ({
  id: `nts-mix-${m.alias}`,
  title: m.title,
  channelTitle: `NTS Infinite Mixtape · ${m.subtitle}`,
  thumbnail: m.picture || '/icons/icon-512.png',
  publishedAt: '',
  description: '',
  streamUrl: m.stream,
})

/** ¿Suena este canal? y botón para ponerlo o pausarlo */
export function useNtsPlayer(track: MusicVideo) {
  const playing = useMusicStore((s) => s.isPlaying && s.queue[s.currentIndex]?.id === track.id)
  const current = useMusicStore((s) => s.queue[s.currentIndex]?.id === track.id)
  const toggle = () => {
    const st = useMusicStore.getState()
    if (current) st.setIsPlaying(!st.isPlaying)
    else st.play([track], 0)
  }
  return { playing, current, toggle }
}

const hhmm = (iso: string) => (iso ? new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : '')

function progress(s: NtsShow): number {
  const a = Date.parse(s.start)
  const b = Date.parse(s.end)
  if (!a || !b || b <= a) return 0
  return Math.min(1, Math.max(0, (Date.now() - a) / (b - a)))
}

export function Bars() {
  return (
    <span className="flex items-end gap-[2px] h-3" aria-hidden>
      {[0, 150, 300].map((d) => (
        <span key={d} className="w-[3px] h-full bg-current rounded-full origin-bottom animate-eq" style={{ animationDelay: `${d}ms` }} />
      ))}
    </span>
  )
}

function LiveCard({ c }: { c: NtsChannel }) {
  const { playing, toggle } = useNtsPlayer(liveTrack(c))
  const [, tick] = useState(0)
  useEffect(() => {
    const iv = setInterval(() => tick((x) => x + 1), 30000)
    return () => clearInterval(iv)
  }, [])
  const p = progress(c.now)
  return (
    <article className="relative overflow-hidden rounded-3xl bg-surface-1 border border-white/8 min-h-[22rem] flex flex-col justify-end">
      {c.now.picture && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.now.picture} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/10" />
      <div className="relative p-5">
        <div className="flex items-center gap-2 text-xs font-bold tracking-widest uppercase">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500 text-white px-2.5 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> En vivo
          </span>
          <span className="text-white/80">NTS {c.id}</span>
        </div>
        <h3 className="mt-3 text-2xl sm:text-3xl font-bold text-white leading-tight">{c.now.title}</h3>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/70">
          <span>
            {hhmm(c.now.start)} – {hhmm(c.now.end)}
          </span>
          {c.now.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" /> {c.now.location}
            </span>
          )}
        </p>
        {c.now.genres.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {c.now.genres.map((g) => (
              <span key={g} className="rounded-full bg-white/10 backdrop-blur px-2.5 py-0.5 text-[11px] text-white/90">
                {g}
              </span>
            ))}
          </div>
        )}
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={toggle}
            className="shrink-0 w-14 h-14 rounded-full bg-white text-black flex items-center justify-center shadow-xl active:scale-95 transition-transform"
            aria-label={playing ? `Pausar NTS ${c.id}` : `Escuchar NTS ${c.id}`}
          >
            {playing ? <Pause className="w-6 h-6 fill-black" /> : <Play className="w-6 h-6 fill-black ml-0.5" />}
          </button>
          <div className="flex-1 min-w-0">
            <div className="h-1 rounded-full bg-white/20 overflow-hidden">
              <div className="h-full bg-white rounded-full" style={{ width: `${Math.round(p * 100)}%` }} />
            </div>
            <p className="mt-1.5 text-[11px] text-white/60 truncate">
              {c.next[0] ? `Después: ${c.next[0].title} · ${hhmm(c.next[0].start)}` : 'NTS Radio'}
            </p>
          </div>
        </div>
      </div>
    </article>
  )
}

function Schedule({ c }: { c: NtsChannel }) {
  return (
    <div>
      <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">A continuación en NTS {c.id}</h3>
      <ol className="divide-y divide-white/5 rounded-2xl bg-surface-1/60 border border-white/8">
        {c.next.slice(0, 8).map((s, i) => (
          <li key={`${s.start}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
            <span className="w-12 shrink-0 text-violet-300 text-xs font-bold tabular-nums">{hhmm(s.start)}</span>
            <span className="min-w-0">
              <span className="block text-white text-sm truncate">{s.title}</span>
              {s.location && <span className="block text-slate-500 text-[11px] truncate">{s.location}</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function MixtapeTile({ m }: { m: NtsMixtape }) {
  const { playing, current, toggle } = useNtsPlayer(mixtapeTrack(m))
  return (
    <button onClick={toggle} className="group text-left" aria-label={playing ? `Pausar ${m.title}` : `Escuchar ${m.title}`}>
      <div className={`relative aspect-square rounded-2xl overflow-hidden bg-surface-2 border ${current ? 'border-violet-400' : 'border-white/8'}`}>
        {m.picture && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.picture} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        <span
          className={`absolute bottom-2 right-2 w-10 h-10 rounded-full flex items-center justify-center shadow-lg ${
            playing ? 'bg-violet-500 text-white' : 'bg-white text-black'
          }`}
        >
          {playing ? <Bars /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
        </span>
      </div>
      <p className="mt-2 text-white text-sm font-bold truncate">{m.title}</p>
      <p className="text-slate-500 text-xs line-clamp-2 leading-snug">{m.subtitle}</p>
    </button>
  )
}

export default function NtsClient() {
  const data = useNts()
  return (
    <div className="pt-24 pb-40 px-4 max-w-6xl mx-auto min-h-screen">
      <Link href="/music/library" className="text-slate-400 text-sm hover:text-white">
        ← Biblioteca
      </Link>
      <header className="mt-4 mb-8">
        <p className="inline-flex items-center gap-2 text-xs font-bold tracking-[0.3em] uppercase text-violet-300">
          <Radio className="w-4 h-4" /> Radio de Londres
        </p>
        <h1 className="mt-2 text-4xl sm:text-5xl font-bold text-white">NTS Radio</h1>
        <p className="mt-2 text-slate-400 text-sm max-w-xl">
          Radio independiente: programas en vivo desde Londres, Los Ángeles, Manchester y Shanghái, y mixtapes temáticos que suenan las
          24 horas.
        </p>
      </header>

      {data === null && (
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando NTS…
        </div>
      )}
      {data === 'error' && <p className="text-slate-400 text-sm">NTS no responde ahora. Intenta en unos minutos.</p>}

      {data && data !== 'error' && (
        <div className="space-y-12">
          <section>
            <h2 className="text-white text-xl font-bold mb-4">En vivo ahora</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {data.live.map((c) => (
                <LiveCard key={c.id} c={c} />
              ))}
            </div>
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              {data.live.map((c) => (
                <Schedule key={c.id} c={c} />
              ))}
            </div>
          </section>

          {data.mixtapes.length > 0 && (
            <section>
              <h2 className="text-white text-xl font-bold">Infinite Mixtapes</h2>
              <p className="text-slate-400 text-sm mb-4">Canales temáticos sin pausa: elige el ánimo y deja que suene.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {data.mixtapes.map((m) => (
                  <MixtapeTile key={m.alias} m={m} />
                ))}
              </div>
            </section>
          )}

          <p className="text-slate-600 text-xs">
            Contenido y transmisiones de{' '}
            <a href="https://www.nts.live" target="_blank" rel="noopener noreferrer" className="underline">
              NTS Radio
            </a>
            .
          </p>
        </div>
      )}
    </div>
  )
}

/** Biblioteca: acceso a NTS con los dos canales en vivo para ponerlos al tiro */
export function NtsLibraryCard() {
  const data = useNts()
  const live = data && data !== 'error' ? data.live : []
  return (
    <section className="mb-3 relative overflow-hidden rounded-2xl border border-white/8 bg-gradient-to-br from-zinc-900 via-surface-1 to-violet-950/60 p-4">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500 text-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> En vivo
        </span>
        <h2 className="text-white text-sm font-bold font-display whitespace-nowrap">NTS Radio</h2>
        <Link href="/music/nts" className="ml-auto inline-flex items-center gap-0.5 text-xs text-violet-300 font-semibold whitespace-nowrap">
          Ver todo <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      <p className="mt-1 text-slate-400 text-xs">Radio independiente en vivo desde Londres y mixtapes las 24 horas</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {live.length === 0
          ? [0, 1].map((i) => <div key={i} className="h-14 rounded-xl bg-white/5 animate-pulse" />)
          : live.map((c) => <LiveRow key={c.id} c={c} />)}
      </div>
    </section>
  )
}

function LiveRow({ c }: { c: NtsChannel }) {
  const { playing, toggle } = useNtsPlayer(liveTrack(c))
  return (
    <button onClick={toggle} className="flex items-center gap-3 rounded-xl bg-white/5 hover:bg-white/10 p-2 text-left" aria-label={playing ? `Pausar NTS ${c.id}` : `Escuchar NTS ${c.id}`}>
      <span className="relative w-10 h-10 rounded-lg overflow-hidden bg-surface-2 shrink-0">
        {c.now.picture && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.now.picture} alt="" className="w-full h-full object-cover" loading="lazy" />
        )}
        <span className={`absolute inset-0 flex items-center justify-center ${playing ? 'bg-violet-500/70 text-white' : 'bg-black/40 text-white'}`}>
          {playing ? <Bars /> : <Play className="w-4 h-4 fill-white" />}
        </span>
      </span>
      <span className="min-w-0">
        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">NTS {c.id}</span>
        <span className="block text-white text-sm font-semibold truncate">{c.now.title}</span>
      </span>
    </button>
  )
}
