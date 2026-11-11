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

/** Une las filas en una lista, alternando (una de tus artistas, una de parecidos…) */
export function interleave(rows: Row[]): V[] {
  const lists = rows.map((r) => r.items)
  const out: V[] = []
  const seen = new Set<string>()
  for (let i = 0; lists.some((l) => i < l.length); i++)
    for (const l of lists) if (i < l.length && !seen.has(l[i].id)) (seen.add(l[i].id), out.push(l[i]))
  return out
}

/**
 * Filas de videos: «De tus artistas» y «Artistas parecidos» (los parecidos de tus dos principales,
 * sin repetir los tuyos). `emit` se llama al tener cada parte.
 */
/** Mezcla al azar (cada visita sale distinto) */
export function shuffled<T>(list: T[]): T[] {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Cómo se pide a YouTube: cambia la frase para que no siempre salga lo mismo
const SUFFIXES = ['video oficial', 'music video', 'videoclip oficial', 'video oficial en vivo', 'official video']

/**
 * Artistas para esta visita: de tus favoritos (los más escuchados primero), 4 al azar entre los
 * primeros 10, para que la sección cambie cada vez.
 */
export function pickArtists(mine: string[], n = 4): string[] {
  return shuffled(mine.slice(0, 10)).slice(0, n)
}

export async function artistVideoRows(names: string[], mine: string[], emit: (rows: Row[], similar: string[]) => void) {
  const out: Row[] = []
  const suffix = SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)]
  const own = shuffled(await searchVideos(`${names.join('|')} ${suffix}`).catch(() => [] as V[]))
  if (own.length) out.push({ title: 'De tus artistas', sub: names.slice(0, 3).join(', '), items: own })
  emit([...out], [])
  const known = new Set(mine.map((n) => n.toLowerCase()))
  const rel = await Promise.all(
    names.slice(0, 2).map((n) => cachedJson<{ artists?: CatalogArtist[] }>(`/api/catalog/related?name=${encodeURIComponent(n)}`, 86400_000).then((d) => d?.artists ?? []).catch(() => [] as CatalogArtist[]))
  )
  const similar = Array.from(new Set(rel.flat().map((a) => a.name).filter((n) => !known.has(n.toLowerCase())))).slice(0, 10)
  const pick = similar.slice(0, 4)
  if (pick.length) {
    const vids = shuffled(await searchVideos(`${pick.join('|')} ${suffix}`).catch(() => [] as V[]))
    if (vids.length) out.push({ title: 'Artistas parecidos', sub: pick.slice(0, 3).join(', '), items: vids })
  }
  emit(out, similar)
}

export function videoOf(v: V): MusicVideo {
  return { id: v.id, title: v.title, channelTitle: v.channel, thumbnail: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`, publishedAt: '', description: '' } as MusicVideo
}
