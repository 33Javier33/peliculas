import { NextRequest, NextResponse } from 'next/server'
import { searchCatalog } from '@/lib/catalog'

// /api/catalog/search?q=… → artistas y álbumes (Deezer)
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get('q') || '').trim().slice(0, 100)
  if (q.length < 2) return NextResponse.json({ artists: [], albums: [] })
  const data = await searchCatalog(q).catch(() => ({ artists: [], albums: [] }))
  return NextResponse.json(data, { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } })
}
