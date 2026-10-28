import { NextRequest, NextResponse } from 'next/server'
import { getLatestReleases } from '@/lib/catalog'

// /api/catalog/releases?ids=13,27 → últimos lanzamientos de esos artistas (Deezer)
export async function GET(request: NextRequest) {
  const ids = (request.nextUrl.searchParams.get('ids') || '')
    .split(',')
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n > 0)
  if (ids.length === 0) return NextResponse.json({ albums: [] })
  const albums = await getLatestReleases(ids).catch(() => [])
  return NextResponse.json({ albums }, { headers: { 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400' } })
}
