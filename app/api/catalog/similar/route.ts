import { NextRequest, NextResponse } from 'next/server'
import { getSimilarTracks } from '@/lib/catalog'

// /api/catalog/similar?name=Metallica (o ?id=119) → canciones de artistas parecidos (pendientes)
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams
  const id = Number(p.get('id')) || undefined
  const name = (p.get('name') || '').trim().slice(0, 100) || undefined
  if (!id && !name) return NextResponse.json({ tracks: [] }, { status: 400 })
  const tracks = await getSimilarTracks({ id, name }).catch(() => [])
  return NextResponse.json({ tracks }, { headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' } })
}
