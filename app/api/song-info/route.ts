import { NextRequest, NextResponse } from 'next/server'
import { getSongInfo } from '@/lib/music-info'

// /api/song-info?artist=…&title=… → { song } (Wikipedia: historia, inspiración, letra… o null)
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams
  const artist = (p.get('artist') || '').trim().slice(0, 120)
  const title = (p.get('title') || '').trim().slice(0, 200)
  if (!title) return NextResponse.json({ song: null }, { status: 400 })
  const song = await getSongInfo(title, artist).catch(() => null)
  return NextResponse.json(
    { song },
    // Lo guarda el CDN de Vercel (no se vuelve a ejecutar): un mes si se encontró, un día si no
    { headers: { 'Cache-Control': song ? 'public, s-maxage=2592000, stale-while-revalidate=2592000' : 'public, s-maxage=86400' } }
  )
}
