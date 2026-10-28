'use client'

import { useRef, useState } from 'react'
import { Play, Shuffle, Loader2 } from 'lucide-react'
import { useMusicStore } from '@/store/musicStore'
import type { MusicVideo } from '@/lib/youtube-music'

// Reproducir toda la discografía de un artista (álbumes, EPs y sencillos), en orden o en
// aleatorio. Empieza a sonar con el primer disco listo y el resto se va sumando a la cola
// (en aleatorio, mezclado con lo que queda por sonar).

const songKey = (t: MusicVideo) =>
  t.title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/^[^-–]+[-–]\s*/, '')
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

function shuffle<T>(list: T[]): T[] {
  const a = list.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function ArtistPlayButtons({ albumIds }: { albumIds: number[] }) {
  const [busy, setBusy] = useState<'order' | 'shuffle' | null>(null)
  const [count, setCount] = useState(0)
  const [error, setError] = useState(false)
  const runRef = useRef(0)

  const start = async (mode: 'order' | 'shuffle') => {
    const run = ++runRef.current
    setBusy(mode)
    setError(false)
    setCount(0)
    const ids = mode === 'shuffle' ? shuffle(albumIds) : albumIds
    const seen = new Set<string>()
    let started = false
    let total = 0

    const load = async (id: number) => {
      const r = await fetch(`/api/catalog/album/${id}/play`).catch(() => null)
      if (!r?.ok) return [] as MusicVideo[]
      const d = (await r.json()) as { tracks?: MusicVideo[] }
      return (d.tracks ?? []).filter((t) => {
        const k = songKey(t)
        if (!k || seen.has(k)) return false
        seen.add(k)
        return true
      })
    }

    for (let i = 0; i < ids.length; i += 2) {
      // Dos discos a la vez; si se tocó otro botón, este recorrido se detiene
      const batch = await Promise.all(ids.slice(i, i + 2).map(load))
      if (run !== runRef.current) return
      const tracks = batch.flat()
      if (tracks.length === 0) continue
      total += tracks.length
      setCount(total)
      const st = useMusicStore.getState()
      if (!started) {
        started = true
        // Aleatorio activado (y lo que se sume después se mezcla); en orden, desactivado
        if ((mode === 'shuffle') !== st.shuffle) st.toggleShuffle()
        useMusicStore.getState().play(mode === 'shuffle' ? shuffle(tracks) : tracks, 0)
      } else {
        st.appendToQueue(tracks)
      }
    }
    if (run !== runRef.current) return
    if (!started) setError(true)
    setBusy(null)
  }

  const btn = 'inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold font-display transition-colors disabled:opacity-60'
  return (
    <div className="flex flex-col items-center sm:items-start gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => start('order')} disabled={busy !== null && count === 0} className={`${btn} bg-violet-500 text-white shadow-glow hover:bg-violet-400`}>
          {busy === 'order' && count === 0 ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-white" />}
          Reproducir
        </button>
        <button onClick={() => start('shuffle')} disabled={busy !== null && count === 0} className={`${btn} bg-surface-2 border border-white/10 text-white hover:border-violet-400`}>
          {busy === 'shuffle' && count === 0 ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shuffle className="w-4 h-4" />}
          Aleatorio
        </button>
      </div>
      {busy && (
        <p className="text-slate-400 text-xs flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" />
          {count === 0 ? 'Preparando canciones…' : `${count} canciones en la cola · sumando el resto de la discografía…`}
        </p>
      )}
      {error && <p className="text-amber-400 text-xs">No se pudieron preparar las canciones. Intenta de nuevo en un momento.</p>}
    </div>
  )
}
