import { NextRequest, NextResponse } from 'next/server'
import { getAlbumInfo, getArtistInfo } from '@/lib/music-info'

// /api/music-info?artist=…[&album=…] → { artist, album } (resúmenes de Wikipedia o null)
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams
  const artist = (p.get('artist') || '').trim().slice(0, 120)
  const album = (p.get('album') || '').trim().slice(0, 200)
  if (!artist) return NextResponse.json({ artist: null, album: null }, { status: 400 })
  const [artistInfo, albumInfo] = await Promise.all([
    getArtistInfo(artist).catch(() => null),
    album ? getAlbumInfo(album, artist).catch(() => null) : Promise.resolve(null),
  ])
  return NextResponse.json(
    { artist: artistInfo, album: albumInfo },
    { headers: { 'Cache-Control': 'public, s-maxage=604800, stale-while-revalidate=604800' } }
  )
}
