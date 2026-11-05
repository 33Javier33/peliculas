'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import type { CatalogArtist } from '@/lib/catalog'
import { cachedJson } from '@/lib/client-cache'
import { useMusicStore } from '@/store/musicStore'
import { songArtist } from '@/lib/library-radio'

// En Música (en vez de Tendencias): artistas parecidos a los que más tienes en tu biblioteca,
// agrupados por el artista que los recomienda ("Porque escuchas Soda Stereo").
export default function LibrarySimilarArtists() {
  const saved = useMusicStore((s) => s.saved)
  const savedAlbums = useMusicStore((s) => s.savedAlbums)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Tus artistas más guardados (♥ y álbumes guardados)
  const top = useMemo(() => {
    const count = new Map<string, { name: string; n: number }>()
    const add = (name: string, n = 1) => {
      const k = name.trim().toLowerCase()
      if (!k || k === 'various artists' || k === 'varios artistas') return
      count.set(k, { name: name.trim(), n: (count.get(k)?.n ?? 0) + n })
    }
    saved.forEach((t) => add(songArtist(t)))
    savedAlbums.forEach((a) => add(a.artist, 3))
    return Array.from(count.values()).sort((a, b) => b.n - a.n)
  }, [saved, savedAlbums])

  const [groups, setGroups] = useState<{ because: string; artists: CatalogArtist[] }[] | null>(null)
  const seeds = top.slice(0, 5).map((a) => a.name).join('|')
  useEffect(() => {
    if (!mounted) return
    if (!seeds) return setGroups([])
    let cancelled = false
    const mine = new Set(top.map((a) => a.name.toLowerCase()))
    Promise.all(
      seeds.split('|').map((name) =>
        cachedJson<{ artists?: CatalogArtist[] }>(`/api/catalog/related?name=${encodeURIComponent(name)}`, 86400_000).then((d) => ({ because: name, artists: d?.artists ?? [] }))
      )
    ).then((list) => {
      if (cancelled) return
      // Sin repetir artistas entre grupos ni mostrar los que ya tienes
      const shown = new Set<number>()
      setGroups(
        list
          .map((g) => ({ because: g.because, artists: g.artists.filter((a) => !mine.has(a.name.toLowerCase()) && !shown.has(a.id) && shown.add(a.id)).slice(0, 10) }))
          .filter((g) => g.artists.length > 0)
      )
    })
    return () => {
      cancelled = true
    }
  }, [seeds, mounted]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!mounted || (groups && groups.length === 0 && top.length > 0)) return null
  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-5 h-5 text-violet-400" />
        <h2 className="text-white font-bold text-[22px] leading-7">Artistas similares a tu biblioteca</h2>
      </div>
      {top.length === 0 ? (
        <p className="text-slate-500 text-sm rounded-2xl border border-dashed border-white/10 p-4">
          Dale ♥ a canciones o guarda álbumes: aquí aparecerán artistas parecidos a los que escuchas.
        </p>
      ) : !groups ? (
        <div className="flex gap-4 overflow-hidden" aria-hidden>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="shrink-0 w-28">
              <div className="w-28 h-28 rounded-full bg-white/[0.06] animate-pulse" />
              <div className="h-3 w-20 mx-auto mt-2 rounded bg-white/[0.06] animate-pulse" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <div key={g.because}>
              <p className="text-slate-400 text-sm mb-3">
                Porque escuchas <span className="text-white font-semibold">{g.because}</span>
              </p>
              <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">
                {g.artists.map((a) => (
                  <Link key={a.id} href={`/music/artist/${a.id}`} className="shrink-0 w-28 text-center group">
                    <span className="block w-28 h-28 rounded-full overflow-hidden bg-surface-2 border border-white/10">
                      {a.picture && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.picture} alt={a.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      )}
                    </span>
                    <span className="block text-white text-sm font-semibold mt-2 line-clamp-2 group-hover:text-violet-300">{a.name}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
