import { NextRequest, NextResponse } from 'next/server'

// Números públicos de una canción o video, solo para mostrar (no se publica nada en esos sitios):
//   /api/social?yt=VIDEO_ID      → me gusta, vistas y comentarios destacados de YouTube
//   /api/social?artist=NOMBRE    → fans del artista en Deezer
export const runtime = 'nodejs'

const YT = process.env.YOUTUBE_API_BASE || 'https://www.googleapis.com/youtube/v3'
const DEEZER = process.env.DEEZER_API_BASE || 'https://api.deezer.com'
const CACHE = { 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400' }

const decode = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

async function youtube(id: string) {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) return { error: 'not_configured' }
  const get = (path: string) =>
    fetch(`${YT}/${path}&key=${key}`, { signal: AbortSignal.timeout(8000), next: { revalidate: 21600 } })
      .then(async (r) => ({ ok: r.ok, data: (await r.json().catch(() => null)) as Record<string, unknown> | null }))
      .catch(() => ({ ok: false, data: null }))
  const [v, c] = await Promise.all([
    get(`videos?part=statistics&id=${id}`),
    get(`commentThreads?part=snippet&videoId=${id}&order=relevance&maxResults=20&textFormat=plainText`),
  ])
  const stats = ((v.data?.items as { statistics?: Record<string, string> }[] | undefined)?.[0]?.statistics) ?? null
  type Thread = { id: string; snippet: { totalReplyCount?: number; topLevelComment: { snippet: { authorDisplayName: string; authorProfileImageUrl?: string; textDisplay?: string; textOriginal?: string; likeCount?: number; publishedAt?: string } } } }
  const reason = ((c.data?.error as { errors?: { reason?: string }[] } | undefined)?.errors?.[0]?.reason) ?? ''
  const comments = ((c.data?.items as Thread[] | undefined) ?? []).map((t) => {
    const s = t.snippet.topLevelComment.snippet
    return {
      id: t.id,
      author: s.authorDisplayName,
      avatar: s.authorProfileImageUrl?.startsWith('https://') ? s.authorProfileImageUrl : '',
      text: decode(s.textOriginal || s.textDisplay || '').slice(0, 1200),
      likes: s.likeCount ?? 0,
      replies: t.snippet.totalReplyCount ?? 0,
      at: s.publishedAt ? Date.parse(s.publishedAt) : 0,
    }
  })
  return {
    likes: stats?.likeCount ? Number(stats.likeCount) : null,
    views: stats?.viewCount ? Number(stats.viewCount) : null,
    commentCount: stats?.commentCount ? Number(stats.commentCount) : null,
    commentsOff: reason === 'commentsDisabled',
    comments,
  }
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

async function deezer(artist: string) {
  const r = await fetch(`${DEEZER}/search/artist?q=${encodeURIComponent(artist)}&limit=5`, { signal: AbortSignal.timeout(8000), next: { revalidate: 86400 } }).catch(() => null)
  const d = (await r?.json().catch(() => null)) as { data?: { id: number; name: string; nb_fan?: number; link?: string }[] } | null
  const list = d?.data ?? []
  // Solo si el nombre calza (si no, podría ser otro artista)
  const hit = list.find((a) => norm(a.name) === norm(artist))
  if (!hit) return { fans: null }
  return { fans: hit.nb_fan ?? null, name: hit.name, link: hit.link }
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const yt = sp.get('yt') || ''
  const artist = (sp.get('artist') || '').trim().slice(0, 100)
  if (yt) {
    if (!/^[A-Za-z0-9_-]{11}$/.test(yt)) return NextResponse.json({ error: 'id' }, { status: 400 })
    return NextResponse.json(await youtube(yt), { headers: CACHE })
  }
  if (artist) return NextResponse.json(await deezer(artist), { headers: CACHE })
  return NextResponse.json({ error: 'falta yt o artist' }, { status: 400 })
}
