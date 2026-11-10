'use client'

// Videos musicales de tus artistas y de los parecidos (los usan la página de videos y el feed)
import { useMemo } from 'react'
import { useMusicStore } from '@/store/musicStore'
import { useFollowStore } from '@/store/followStore'
import { songArtist } from '@/lib/library-radio'
import { cachedJson } from '@/lib/client-cache'
import { decodeEntities } from '@/lib/youtube-music'
import type { YouTubeSearchItem } from '@/lib/youtube'
import type { CatalogArtist } from '@/lib/catalog'
import type { MusicVideo } from '@/lib/youtube-music'

export type V = { id: string; title: string; channel: string }

export const toV = (it: YouTubeSearchItem): V => ({ id: it.id.videoId, title: decodeEntities(it.snippet.title), channel: decodeEntities(it.snippet.channelTitle) })

/** Videos de una búsqueda (guardados 12 h: no se gasta la cuota de YouTube en cada visita) */
export async function searchVideos(q: string): Promise<V[]> {
  const d = await cachedJson<{ items?: YouTubeSearchItem[] }>(`/api/youtube/search?lang=todo&q=${encodeURIComponent(q)}`, 12 * 3600_000, (x) => !!x?.items?.length)
  return (d?.items ?? []).filter((it) => it.id?.videoId).map(toV)
}

/** Tus artistas: los que sigues y los que más tienes en la biblioteca */
export function useMyArtists(): string[] {
  const saved = useMusicStore((s) => s.saved)
  const savedAlbums = useMusicStore((s) => s.savedAlbums)
  const follows = useFollowStore((s) => s.artists)
  return useMemo(() => {
    const count = new Map<string, { name: string; n: number }>()
    const add = (name: string, n: number) => {
      const k = name?.trim().toLowerCase()
      if (!k || k === 'various artists' || k === 'varios artistas') return
      count.set(k, { name: name.trim(), n: (count.get(k)?.n ?? 0) + n })
    }
    follows.forEach((a) => add(a.name, 5))
    savedAlbums.forEach((a) => add(a.artist, 3))
    saved.forEach((t) => add(songArtist(t), 1))
    return Array.from(count.values()).sort((a, b) => b.n - a.n).map((a) => a.name)
  }, [saved, savedAlbums, follows])
}


export type Row = { title: string; sub: string; items: V[] }

/**
 * Filas de videos: «De tus artistas» y «Artistas parecidos» (los parecidos de tus dos principales,
 * sin repetir los tuyos). `emit` se llama al tener cada parte.
 */
export async function artistVideoRows(names: string[], mine: string[], emit: (rows: Row[], similar: string[]) => void) {
  const out: Row[] = []
  const own = await searchVideos(`${names.join('|')} video oficial`).catch(() => [] as V[])
  if (own.length) out.push({ title: 'De tus artistas', sub: names.slice(0, 3).join(', '), items: own })
  emit([...out], [])
  const known = new Set(mine.map((n) => n.toLowerCase()))
  const rel = await Promise.all(
    names.slice(0, 2).map((n) => cachedJson<{ artists?: CatalogArtist[] }>(`/api/catalog/related?name=${encodeURIComponent(n)}`, 86400_000).then((d) => d?.artists ?? []).catch(() => [] as CatalogArtist[]))
  )
  const similar = Array.from(new Set(rel.flat().map((a) => a.name).filter((n) => !known.has(n.toLowerCase())))).slice(0, 10)
  const pick = similar.slice(0, 4)
  if (pick.length) {
    const vids = await searchVideos(`${pick.join('|')} video oficial`).catch(() => [] as V[])
    if (vids.length) out.push({ title: 'Artistas parecidos', sub: pick.slice(0, 3).join(', '), items: vids })
  }
  emit(out, similar)
}

export function videoOf(v: V): MusicVideo {
  return { id: v.id, title: v.title, channelTitle: v.channel, thumbnail: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`, publishedAt: '', description: '' } as MusicVideo
}
