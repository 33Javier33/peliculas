import { NextRequest, NextResponse } from 'next/server'
import { publicSearch } from '@/lib/public-search'

// Los temas más vistos de un artista (YouTube, ordenados por reproducciones). Solo títulos y cifras.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BASE = 'https://www.googleapis.com/youtube/v3'
// Respaldo sin clave de YouTube (sin cifras de reproducciones): búsqueda pública de videos del artista
async function fallback(name: string) {
  const want = norm(name)
  const found = await publicSearch(`${name} official`).catch(() => [])
  return found
    .filter((v) => norm(v.title + (v.author ?? '')).includes(want))
    .slice(0, 10)
    .map((v) => ({ id: v.id, title: v.title, channel: v.author ?? '', thumbnail: v.thumbnail || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`, views: 0 }))
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

export async function GET(request: NextRequest) {
  const name = (request.nextUrl.searchParams.get('name') || '').trim().slice(0, 80)
  const key = process.env.YOUTUBE_API_KEY
  if (!name) return NextResponse.json({ tracks: [] }, { status: 400 })
  if (!key) return NextResponse.json({ tracks: await fallback(name) })
  const sq = new URL(`${BASE}/search`)
  sq.search = new URLSearchParams({ key, part: 'snippet', type: 'video', videoCategoryId: '10', order: 'viewCount', maxResults: '25', q: `${name} official audio` }).toString()
  const search = await fetch(sq.toString(), { next: { revalidate: 43200 } }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  const items = ((search?.items ?? []) as { id?: { videoId?: string }; snippet?: { title: string; channelTitle: string; thumbnails?: { high?: { url: string }; medium?: { url: string } } } }[])
    .filter((it) => it.id?.videoId && it.snippet)
  // Solo lo que es del artista (título o canal lo nombran), para no mezclar otros
  const want = norm(name)
  const own = items.filter((it) => norm(it.snippet!.title + it.snippet!.channelTitle).includes(want))
  const ids = own.map((it) => it.id!.videoId!).slice(0, 25)
  if (!ids.length) return NextResponse.json({ tracks: await fallback(name) }, { headers: { 'Cache-Control': 'public, s-maxage=43200' } })
  const vq = new URLSearchParams({ key, part: 'statistics', id: ids.join(',') }).toString()
  const stats = await fetch(`${BASE}/videos?${vq}`, { next: { revalidate: 43200 } }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  const views = new Map<string, number>(((stats?.items ?? []) as { id: string; statistics?: { viewCount?: string } }[]).map((v) => [v.id, Number(v.statistics?.viewCount ?? 0)]))
  const tracks = own
    .map((it) => ({
      id: it.id!.videoId!,
      title: decode(it.snippet!.title),
      channel: decode(it.snippet!.channelTitle),
      thumbnail: `https://i.ytimg.com/vi/${it.id!.videoId}/hqdefault.jpg`,
      views: views.get(it.id!.videoId!) ?? 0,
    }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10)
  return NextResponse.json({ tracks }, { headers: { 'Cache-Control': 'public, s-maxage=43200, stale-while-revalidate=86400' } })
}
