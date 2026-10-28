import { NextRequest, NextResponse } from 'next/server'
import { resolveTrack } from '@/lib/catalog'

export const maxDuration = 30

// /api/catalog/resolve?artist=…&title=…&d=segundos → { id } (video de YouTube de esa canción)
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams
  const artist = (p.get('artist') || '').slice(0, 120)
  const title = (p.get('title') || '').slice(0, 200)
  if (!title) return NextResponse.json({ id: null }, { status: 400 })
  const id = await resolveTrack(artist, title, Number(p.get('d')) || 0).catch(() => null)
  return NextResponse.json(
    { id },
    { status: id ? 200 : 404, headers: id ? { 'Cache-Control': 'public, s-maxage=604800, stale-while-revalidate=604800' } : {} }
  )
}
