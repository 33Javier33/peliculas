import { NextRequest, NextResponse } from 'next/server'
import { getAlbumInfo, getArtistInfo, getArtistFacts } from '@/lib/music-info'

// /api/music-info?artist=…[&album=…] → { artist, album, facts } (Wikipedia y MusicBrainz, o null)
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams
  const artist = (p.get('artist') || '').trim().slice(0, 120)
  const album = (p.get('album') || '').trim().slice(0, 200)
  if (!artist) return NextResponse.json({ artist: null, album: null }, { status: 400 })
  const [artistInfo, albumInfo, facts] = await Promise.all([
    getArtistInfo(artist).catch(() => null),
    album ? getAlbumInfo(album, artist).catch(() => null) : Promise.resolve(null),
    getArtistFacts(artist).catch(() => null),
  ])
  return NextResponse.json(
    { artist: artistInfo, album: albumInfo, facts },
    // Sin biografía (Wikipedia no respondió a tiempo): se vuelve a preguntar pronto, no en una semana
    { headers: { 'Cache-Control': artistInfo || facts ? 'public, s-maxage=604800, stale-while-revalidate=604800' : 'public, s-maxage=300' } }
  )
}
