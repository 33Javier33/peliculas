import { NextRequest, NextResponse } from 'next/server'
import { getTvChannels } from '@/lib/live'
import { getRequestRegion } from '@/lib/region'

// /api/tv?list=cl | ?list=spa (en español, todo el mundo) | ?list=news ; sin list → país del usuario
export async function GET(request: NextRequest) {
  const listParam = (request.nextUrl.searchParams.get('list') || '').toLowerCase()
  const list = /^[a-z]{2}$/.test(listParam) || listParam === 'spa' || listParam === 'news'
    ? listParam
    : getRequestRegion(request).toLowerCase()

  try {
    const channels = await getTvChannels(list)
    return NextResponse.json(
      { channels, list },
      { headers: { 'Cache-Control': listParam ? 'public, s-maxage=21600, stale-while-revalidate=43200' : 'private, max-age=600' } }
    )
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message, channels: [] }, { status: 502 })
  }
}
