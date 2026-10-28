'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Users } from 'lucide-react'
import { useFollowStore } from '@/store/followStore'
import type { CatalogAlbum } from '@/lib/catalog'
import { readSession, writeSession } from '@/lib/session-cache'

// Artistas y grupos que sigues, con sus últimos lanzamientos (álbumes, EPs y sencillos).
export default function FollowedArtistsSection({ showEmpty = false }: { showEmpty?: boolean }) {
  const artists = useFollowStore((s) => s.artists)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const [releases, setReleases] = useState<CatalogAlbum[]>([])

  const ids = artists.map((a) => a.id).join(',')
  useEffect(() => {
    if (!ids) return setReleases([])
    const key = `releases:${ids}`
    const cached = readSession<CatalogAlbum[]>(key)
    if (cached) return setReleases(cached)
    fetch(`/api/catalog/releases?ids=${ids}`)
      .then((r) => r.json())
      .then((d: { albums: CatalogAlbum[] }) => {
        setReleases(d.albums)
        writeSession(key, d.albums)
      })
      .catch(() => {})
  }, [ids])

  if (!mounted) return null
  if (artists.length === 0) {
    if (!showEmpty) return null
    return (
      <section className="mb-10 rounded-2xl border border-dashed border-white/10 p-5 text-center">
        <Users className="w-8 h-8 text-slate-600 mx-auto mb-2" />
        <p className="text-slate-300 text-sm font-semibold">Aún no sigues a ningún artista</p>
        <p className="text-slate-500 text-xs mt-1">Busca un artista o grupo y toca «Seguir» para ver aquí sus lanzamientos.</p>
      </section>
    )
  }

  return (
    <section className="mb-10">
      <h2 className="text-white font-bold text-[22px] leading-7 mb-4">Artistas que sigues</h2>
      <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">
        {artists.map((a) => (
          <Link key={a.id} href={`/music/artist/${a.id}`} className="shrink-0 w-20 text-center group">
            <div className="relative w-20 h-20 rounded-full overflow-hidden bg-surface-2 border border-white/10 group-hover:border-violet-400">
              {a.picture && <Image src={a.picture} alt={a.name} fill sizes="80px" className="object-cover" />}
            </div>
            <p className="text-slate-200 text-xs font-semibold mt-1.5 line-clamp-2 leading-tight">{a.name}</p>
          </Link>
        ))}
      </div>

      {releases.length > 0 && (
        <>
          <h3 className="text-white font-bold text-lg mt-6 mb-3">Novedades de tus artistas</h3>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">
            {releases.slice(0, 24).map((al) => (
              <Link key={al.id} href={`/music/album/${al.id}`} className="shrink-0 w-36 group">
                <div className="relative aspect-square rounded-xl overflow-hidden bg-surface-2 border border-white/8">
                  {al.cover && <Image src={al.cover} alt={al.title} fill sizes="144px" className="object-cover group-hover:scale-105 transition-transform duration-500" />}
                </div>
                <p className="text-white text-sm font-semibold leading-tight line-clamp-2 mt-1.5 group-hover:text-violet-300">{al.title}</p>
                <p className="text-slate-500 text-xs truncate">
                  {[al.artist.name || artists.find((x) => x.id === al.artist.id)?.name, al.year, al.type === 'single' ? 'Sencillo' : al.type === 'ep' ? 'EP' : 'Álbum'].filter(Boolean).join(' · ')}
                </p>
              </Link>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
