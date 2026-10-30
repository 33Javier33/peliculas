import { NextRequest, NextResponse } from 'next/server'
import { searchArchiveAudio } from '@/lib/archive-audio'

// /api/archive-audio?q=…&page=… → discos y grabaciones de Internet Archive
export const runtime = 'nodejs'
export const maxDuration = 20

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get('q') || '').slice(0, 120)
  const page = Math.max(1, Math.min(20, Number(request.nextUrl.searchParams.get('page')) || 1))
  try {
    const collection = (request.nextUrl.searchParams.get('collection') || '').slice(0, 60)
    const data = await searchArchiveAudio(q, page, collection)
    return NextResponse.json(data, { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || 'No se pudo buscar', results: [], total: 0 }, { status: 502 })
  }
}
