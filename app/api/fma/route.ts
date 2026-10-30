import { NextRequest, NextResponse } from 'next/server'
import { searchFma } from '@/lib/fma'

// /api/fma?q=…&page=… | ?genre=Jazz → canciones de Free Music Archive
export const runtime = 'nodejs'
export const maxDuration = 20

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const q = (sp.get('q') || '').slice(0, 120)
  const genre = (sp.get('genre') || '').slice(0, 40)
  const page = Math.max(1, Math.min(20, Number(sp.get('page')) || 1))
  if (!q.trim() && !genre) return NextResponse.json({ tracks: [] })
  try {
    const tracks = await searchFma(q, page, genre)
    return NextResponse.json({ tracks }, { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || 'No se pudo buscar', tracks: [] }, { status: 502 })
  }
}
