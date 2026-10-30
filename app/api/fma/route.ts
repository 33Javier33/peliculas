import { NextRequest, NextResponse } from 'next/server'
import { searchFma } from '@/lib/fma'
import { searchOpenverse } from '@/lib/openverse'

// /api/fma?q=…&page=… | ?genre=Jazz → canciones de Free Music Archive
export const runtime = 'nodejs'
export const maxDuration = 20

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const q = (sp.get('q') || '').slice(0, 120)
  const genre = (sp.get('genre') || '').slice(0, 40)
  const page = Math.max(1, Math.min(20, Number(sp.get('page')) || 1))
  if (!q.trim() && !genre) return NextResponse.json({ tracks: [] })
  const cache = { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' }
  // Primero Free Music Archive; si no responde o no trae nada, Jamendo y otras (Openverse)
  let fmaError = ''
  try {
    const tracks = await searchFma(q, page, genre)
    if (tracks.length) return NextResponse.json({ tracks, source: 'fma' }, { headers: cache })
    fmaError = 'sin resultados'
  } catch (err) {
    fmaError = (err as Error).message
  }
  try {
    const tracks = await searchOpenverse(q, page, genre)
    return NextResponse.json({ tracks, source: 'openverse', fmaError }, { headers: cache })
  } catch (err) {
    return NextResponse.json({ error: `${fmaError}; ${(err as Error).message}`, tracks: [] }, { status: 502 })
  }
}
