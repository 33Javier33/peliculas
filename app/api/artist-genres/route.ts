import { NextRequest, NextResponse } from 'next/server'
import { getArtistFacts } from '@/lib/music-info'

// /api/artist-genres?name=… → { genres: [...] } (géneros del artista según MusicBrainz)
// Lo usa la radio de Internet Archive para sumar canciones de la biblioteca del mismo género.
export async function GET(request: NextRequest) {
  const name = (request.nextUrl.searchParams.get('name') || '').trim().slice(0, 120)
  if (!name) return NextResponse.json({ genres: [] }, { status: 400 })
  try {
    const facts = await getArtistFacts(name)
    return NextResponse.json(
      { genres: facts?.genres ?? [], known: !!facts },
      { headers: { 'Cache-Control': 'public, s-maxage=2592000, stale-while-revalidate=2592000' } }
    )
  } catch {
    // MusicBrainz ocupado: sin caché, se vuelve a intentar otro día
    return NextResponse.json({ genres: [], error: true }, { status: 503 })
  }
}
