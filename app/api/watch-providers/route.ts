import { NextRequest, NextResponse } from 'next/server'
import { getWatchProviders } from '@/lib/tmdb'
import { getRequestRegion } from '@/lib/region'

// /api/watch-providers?id=550 → dónde ver la película en el país del usuario
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id') || ''
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'id' }, { status: 400 })
  const country = getRequestRegion(request)
  try {
    const providers = await getWatchProviders(id, country)
    return NextResponse.json({ country, providers }, { headers: { 'Cache-Control': 'private, max-age=3600' } })
  } catch (err) {
    return NextResponse.json({ country, providers: null, error: (err as Error).message }, { status: 502 })
  }
}
