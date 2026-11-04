'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { UsersRound } from 'lucide-react'
import type { CatalogArtist } from '@/lib/catalog'
import { cachedJson } from '@/lib/client-cache'

// Artistas similares (Deezer) al final del perfil de un artista o al ver un artista en la biblioteca
export default function SimilarArtists({ id, name, className = '' }: { id?: number; name?: string; className?: string }) {
  const [list, setList] = useState<CatalogArtist[] | null>(null)
  useEffect(() => {
    const q = id ? `id=${id}` : name ? `name=${encodeURIComponent(name)}` : ''
    if (!q) return
    let cancelled = false
    cachedJson<{ artists?: CatalogArtist[] }>(`/api/catalog/related?${q}`, 86400000)
      .then((d) => !cancelled && setList(d?.artists ?? []))
      .catch(() => !cancelled && setList([]))
    return () => {
      cancelled = true
    }
  }, [id, name])
  if (!list || list.length === 0) return null
  return (
    <section className={`mb-10 ${className}`}>
      <h2 className="flex items-center gap-2 text-white font-bold text-[22px] leading-7 mb-4">
        <UsersRound className="w-5 h-5 text-violet-300" /> Artistas similares
      </h2>
      <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">
        {list.map((a) => (
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
    </section>
  )
}
