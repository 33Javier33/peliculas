import { NextRequest, NextResponse } from 'next/server'
import { getNationalChannels, getThemedChannels } from '@/lib/tv'
import { getRequestRegion } from '@/lib/region'

// /api/tv?list=cl | ?list=cl-rm (región) | ?list=spa (en español, todo el mundo) | ?list=news ; sin list → país del usuario
export const maxDuration = 30

export async function GET(request: NextRequest) {
  const listParam = (request.nextUrl.searchParams.get('list') || '').toLowerCase()
  const list = /^[a-z]{2}(-[a-z0-9]{1,3})?$/.test(listParam) || listParam === 'spa' || listParam === 'news'
    ? listParam
    : getRequestRegion(request).toLowerCase()

  try {
    // País: todas las fuentes combinadas (con ciudad); resto: listas temáticas
    const channels = /^[a-z]{2}$/.test(list) ? await getNationalChannels(list) : await getThemedChannels(list)
    return NextResponse.json(
      { channels, list },
      { headers: { 'Cache-Control': listParam ? 'public, s-maxage=21600, stale-while-revalidate=43200' : 'private, max-age=600' } }
    )
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message, channels: [], list }, { status: 502 })
  }
}
