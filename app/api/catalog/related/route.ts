import { NextRequest, NextResponse } from 'next/server'
import { getRelatedArtists } from '@/lib/catalog'

// /api/catalog/related?id=119 | ?name=Metallica → artistas parecidos (con foto)
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams
  const id = Number(p.get('id')) || undefined
  const name = (p.get('name') || '').trim().slice(0, 100) || undefined
  if (!id && !name) return NextResponse.json({ artists: [] }, { status: 400 })
  const artists = await getRelatedArtists({ id, name }).catch(() => [])
  return NextResponse.json({ artists }, { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } })
}
