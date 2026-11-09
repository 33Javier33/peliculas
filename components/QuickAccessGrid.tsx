'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Heart, ListMusic, Disc3, Play, Loader2 } from 'lucide-react'
import type { MusicVideo } from '@/lib/youtube-music'
import { cachedJson } from '@/lib/client-cache'
import { useMusicStore } from '@/store/musicStore'
import { usePlaylistStore } from '@/store/playlistStore'
import { useFollowStore } from '@/store/followStore'
import { useLinksStore } from '@/store/linksStore'

// Accesos rápidos (como en Spotify): Tus me gusta, tus playlists, artistas que sigues y discos
// guardados, en dos columnas y lo más reciente primero
type Tile = {
  key: string
  href: string
  title: string
  image?: string
  round?: boolean
  icon?: 'heart' | 'playlist' | 'disc'
  at: number
  /** Las canciones para reproducir ahí mismo (o cómo conseguirlas) */
  tracks: () => MusicVideo[] | Promise<MusicVideo[]>
}

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
    for (const p of playlists) list.push({ key: `p-${p.id}`, href: `/music/playlist/${p.id}`, title: p.name, image: p.tracks[0]?.thumbnail, icon: 'playlist', at: p.updatedAt, tracks: () => p.tracks })
    for (const a of artists)
      list.push({
        key: `a-${a.id}`,
        href: `/music/artist/${a.id}`,
        title: a.name,
        image: a.picture,
        round: true,
        at: (a as { followedAt?: number }).followedAt ?? 0,
        // Sus canciones más escuchadas (y las tuyas de ese artista primero)
        tracks: async () => {
          const d = await cachedJson<{ tracks?: MusicVideo[] }>(`/api/catalog/artist-tracks?id=${a.id}`, 6 * 3600_000)
          const want = a.name.trim().toLowerCase()
          const mine = useMusicStore.getState().saved.filter((t) => (t.artist || t.channelTitle || '').toLowerCase().includes(want))
          return [...mine, ...(d?.tracks ?? [])]
        },
      })
    for (const a of savedAlbums) {
      const dz = a.id.match(/^deezer-(\d+)$/)?.[1]
      list.push({ key: `s-${a.id}`, href: dz ? `/music/album/${dz}` : `/music/library?album=${encodeURIComponent(a.id)}`, title: a.title, image: a.cover, icon: 'disc', at: a.savedAt, tracks: () => a.tracks })
    }
    for (const a of linkAlbums) {
      const dz = a.id.match(/^ytalb-(\d+)$/)?.[1]
      list.push({
        key: `l-${a.id}`,
        href: dz ? `/music/album/${dz}` : `/music/library?album=${encodeURIComponent(a.id)}`,
        title: a.title,
        image: a.cover,
        icon: 'disc',
        at: a.addedAt,
        tracks: () => {
          const all = useLinksStore.getState().tracks
          return a.trackIds.map((id) => all.find((t) => t.id === id)).filter((t): t is MusicVideo => !!t)
        },
      })
    }
    const seen = new Set<string>()
    const top = list
      .sort((a, b) => b.at - a.at)
      .filter((t) => !seen.has(t.title.toLowerCase()) && seen.add(t.title.toLowerCase()))
      .slice(0, liked.length ? 7 : 8)
    const likedTile: Tile = {
      key: 'liked',
      href: '/music/me-gusta',
      title: 'Tus me gusta',
      icon: 'heart',
      at: Infinity,
      tracks: () => [...useMusicStore.getState().saved].sort((a, b) => b.savedAt - a.savedAt),
    }
    return liked.length ? [likedTile, ...top] : top
  }, [liked.length, savedAlbums, playlists, artists, linkAlbums])

  const [busy, setBusy] = useState<string | null>(null)
  const playTile = async (t: Tile) => {
    if (busy) return
    setBusy(t.key)
    const list = await Promise.resolve(t.tracks()).catch(() => [] as MusicVideo[])
    setBusy(null)
    if (!list.length) return
    const st = useMusicStore.getState()
    if (st.shuffle) st.toggleShuffle()
    st.play(list, 0)
  }

  if (!mounted || tiles.length === 0) return null
  return (
    <section className="mb-9 grid grid-cols-2 gap-2">
      {tiles.map((t) => (
        <div key={t.key} className="relative flex items-center bg-surface-2/70 hover:bg-surface-2 rounded-md overflow-hidden min-w-0 h-14 transition-colors">
          {/* La carátula y el nombre abren el disco, la playlist, el artista o Tus me gusta */}
          <Link href={t.href} className="flex items-center gap-2.5 min-w-0 flex-1 h-full active:bg-white/10">
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
            <span className="min-w-0 flex-1 text-white text-[13px] font-bold leading-tight line-clamp-2">{t.title}</span>
          </Link>
          {/* Reproducir ahí mismo */}
          <button
            onClick={() => playTile(t)}
            className="shrink-0 mr-1.5 w-9 h-9 rounded-full bg-violet-500 text-white flex items-center justify-center shadow-md active:scale-95"
            aria-label={`Reproducir ${t.title}`}
          >
            {busy === t.key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
          </button>
        </div>
      ))}
    </section>
  )
}
