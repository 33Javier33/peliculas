import { NextRequest, NextResponse } from 'next/server'
import { getArtistTopTracks } from '@/lib/catalog'

// /api/catalog/artist-tracks?id=13 | ?name=Shakira → canciones del artista (pendientes)
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams
  const id = Number(p.get('id')) || undefined
  const name = (p.get('name') || '').trim().slice(0, 100) || undefined
  if (!id && !name) return NextResponse.json({ tracks: [] }, { status: 400 })
  const tracks = await getArtistTopTracks({ id, name }).catch(() => [])
  return NextResponse.json({ tracks }, { headers: { 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400' } })
}
