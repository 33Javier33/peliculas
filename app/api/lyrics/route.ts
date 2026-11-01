import { NextRequest, NextResponse } from 'next/server'
import { getLyrics } from '@/lib/lyrics'

export const maxDuration = 25

// /api/lyrics?artist=…&title=…[&duration=segundos] → letra sincronizada (karaoke) o simple
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams
  const artist = (p.get('artist') || '').slice(0, 150)
  const title = (p.get('title') || '').slice(0, 200)
  const duration = Number(p.get('duration')) || undefined
  if (!title) return NextResponse.json({ lyrics: null }, { status: 400 })
  try {
    const lyrics = await getLyrics(artist, title, duration)
    return NextResponse.json({ lyrics }, { headers: { 'Cache-Control': 'public, s-maxage=604800, stale-while-revalidate=604800' } })
  } catch (err) {
    return NextResponse.json({ lyrics: null, error: (err as Error).message }, { status: 502 })
  }
}
