import { NextRequest, NextResponse } from 'next/server'
import { radioBatch, RADIO_GENRES } from '@/lib/archive-radio'

// Radio de Internet Archive por género:
//   (sin parámetros)              → lista de géneros
//   ?genre=rock&skip=id1,id2      → próximas canciones (en discos), sin repetir los discos de skip
export const maxDuration = 30
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams
  const genre = p.get('genre')
  if (!genre) return NextResponse.json({ genres: RADIO_GENRES.map(({ id, label, icon, color }) => ({ id, label, icon, color })) })
  try {
    const skip = (p.get('skip') || '').split(',').filter(Boolean).slice(-200)
    const albums = await radioBatch(genre, skip)
    return NextResponse.json({ albums }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message, albums: [] }, { status: 502 })
  }
}
