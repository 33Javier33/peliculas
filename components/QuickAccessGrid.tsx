'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Heart, ListMusic, Disc3 } from 'lucide-react'
import { useMusicStore } from '@/store/musicStore'
import { usePlaylistStore } from '@/store/playlistStore'
import { useFollowStore } from '@/store/followStore'
import { useLinksStore } from '@/store/linksStore'

// Accesos rápidos (como en Spotify): Tus me gusta, tus playlists, artistas que sigues y discos
// guardados, en dos columnas y lo más reciente primero
type Tile = { key: string; href: string; title: string; image?: string; round?: boolean; icon?: 'heart' | 'playlist' | 'disc'; at: number }

export default function QuickAccessGrid() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const liked = useMusicStore((s) => s.saved)
  const savedAlbums = useMusicStore((s) => s.savedAlbums)
  const playlists = usePlaylistStore((s) => s.playlists)
  const artists = useFollowStore((s) => s.artists)
  const linkAlbums = useLinksStore((s) => s.albums)

  const tiles = useMemo(() => {
    const list: Tile[] = []
    for (const p of playlists) list.push({ key: `p-${p.id}`, href: `/music/playlist/${p.id}`, title: p.name, image: p.tracks[0]?.thumbnail, icon: 'playlist', at: p.updatedAt })
    for (const a of artists) list.push({ key: `a-${a.id}`, href: `/music/artist/${a.id}`, title: a.name, image: a.picture, round: true, at: (a as { followedAt?: number }).followedAt ?? 0 })
    for (const a of savedAlbums) {
      const dz = a.id.match(/^deezer-(\d+)$/)?.[1]
      list.push({ key: `s-${a.id}`, href: dz ? `/music/album/${dz}` : `/music/library?album=${encodeURIComponent(a.id)}`, title: a.title, image: a.cover, icon: 'disc', at: a.savedAt })
    }
    for (const a of linkAlbums) {
      const dz = a.id.match(/^ytalb-(\d+)$/)?.[1]
      list.push({ key: `l-${a.id}`, href: dz ? `/music/album/${dz}` : `/music/library?album=${encodeURIComponent(a.id)}`, title: a.title, image: a.cover, icon: 'disc', at: a.addedAt })
    }
    const seen = new Set<string>()
    const top = list
      .sort((a, b) => b.at - a.at)
      .filter((t) => !seen.has(t.title.toLowerCase()) && seen.add(t.title.toLowerCase()))
      .slice(0, liked.length ? 7 : 8)
    return liked.length ? [{ key: 'liked', href: '/music/library', title: 'Tus me gusta', icon: 'heart' as const, at: Infinity }, ...top] : top
  }, [liked.length, savedAlbums, playlists, artists, linkAlbums])

  if (!mounted || tiles.length === 0) return null
  return (
    <section className="mb-9 grid grid-cols-2 gap-2">
      {tiles.map((t) => (
        <Link key={t.key} href={t.href} className="flex items-center gap-2.5 bg-surface-2/70 hover:bg-surface-2 active:bg-white/10 rounded-md overflow-hidden min-w-0 h-14 transition-colors">
          <span className={`relative w-14 h-14 shrink-0 flex items-center justify-center ${t.icon === 'heart' ? 'bg-gradient-to-br from-violet-600 to-cyan-300' : 'bg-surface-1'}`}>
            {t.icon === 'heart' ? (
              <Heart className="w-6 h-6 text-white fill-white" />
            ) : t.image ? (
              <Image src={t.image} alt="" fill sizes="56px" className={`object-cover ${t.round ? 'rounded-full scale-[0.82]' : ''}`} />
            ) : t.icon === 'playlist' ? (
              <ListMusic className="w-6 h-6 text-violet-300" />
            ) : (
              <Disc3 className="w-6 h-6 text-slate-500" />
            )}
          </span>
          <span className="min-w-0 flex-1 pr-2 text-white text-[13px] font-bold leading-tight line-clamp-2">{t.title}</span>
        </Link>
      ))}
    </section>
  )
}
