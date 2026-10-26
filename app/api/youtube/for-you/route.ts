import { NextRequest, NextResponse } from 'next/server'
import { getForYouVideos } from '@/lib/youtube-music'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const ids = (searchParams.get('ids') || '')
    .split(',')
    .filter((id) => /^[A-Za-z0-9_-]{6,20}$/.test(id))
    .slice(0, 25)
  const artists = searchParams
    .getAll('artist')
    .map((a) => a.trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 3)

  if (ids.length === 0 && artists.length === 0) {
    return NextResponse.json({ videos: [], genres: [], artists: [] })
  }

  try {
    const result = await getForYouVideos(ids, artists)
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=43200' },
    })
  } catch (err) {
    const message = (err as Error).message || 'Error desconocido'
    return NextResponse.json({ error: message }, { status: message.includes('YOUTUBE_API_KEY') ? 500 : 502 })
  }
}
