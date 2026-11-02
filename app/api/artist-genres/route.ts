import { NextRequest, NextResponse } from 'next/server'
import { getArtistFacts } from '@/lib/music-info'
import { itunesGenre } from '@/lib/itunes-genre'

// /api/artist-genres?name=… → { genres: [...] } (géneros del artista según MusicBrainz y iTunes)
// Lo usan la radio de Internet Archive (para sumar canciones de la biblioteca del mismo género) y
// la biblioteca (clasificada por género).
export async function GET(request: NextRequest) {
  const name = (request.nextUrl.searchParams.get('name') || '').trim().slice(0, 120)
  if (!name) return NextResponse.json({ genres: [] }, { status: 400 })
  const [mb, it] = await Promise.allSettled([getArtistFacts(name), itunesGenre(name)])
  const facts = mb.status === 'fulfilled' ? mb.value : null
  const itunes = it.status === 'fulfilled' ? it.value : null
  const genres = Array.from(new Set([...(facts?.genres ?? []), ...(itunes ? [itunes] : [])].map((g) => g.toLowerCase())))
  if (!genres.length && mb.status === 'rejected' && it.status === 'rejected') {
    // Los dos ocupados: sin caché, se vuelve a intentar después
    return NextResponse.json({ genres: [], error: true }, { status: 503 })
  }
  return NextResponse.json(
    { genres, known: !!facts || !!itunes },
    // Sin géneros: se vuelve a preguntar en un día (no en un mes)
    { headers: { 'Cache-Control': genres.length ? 'public, s-maxage=2592000, stale-while-revalidate=2592000' : 'public, s-maxage=86400' } }
  )
}
