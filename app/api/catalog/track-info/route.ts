import { NextRequest, NextResponse } from 'next/server'
import { findTrackInfo } from '@/lib/catalog'

// /api/catalog/track-info?artist=…&title=… → álbum y artista del catálogo de esa canción
export async function GET(request: NextRequest) {
  const artist = (request.nextUrl.searchParams.get('artist') || '').slice(0, 100)
  const title = (request.nextUrl.searchParams.get('title') || '').slice(0, 150)
  if (!artist || !title) return NextResponse.json({ info: null })
  try {
    const info = await findTrackInfo(artist, title)
    return NextResponse.json({ info }, { headers: { 'Cache-Control': info?.album ? 'public, s-maxage=86400, stale-while-revalidate=604800' : 'public, s-maxage=300' } })
  } catch {
    return NextResponse.json({ info: null })
  }
}
