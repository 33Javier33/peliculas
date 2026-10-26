import { NextRequest, NextResponse } from 'next/server'
import { getTvRegions } from '@/lib/live'

// /api/tv/regions?country=CL → regiones (para canales locales)
export async function GET(request: NextRequest) {
  const country = (request.nextUrl.searchParams.get('country') || '').toUpperCase()
  if (!/^[A-Z]{2}$/.test(country)) return NextResponse.json({ regions: [] })
  const regions = await getTvRegions(country).catch(() => [])
  return NextResponse.json({ regions }, { headers: { 'Cache-Control': 'public, s-maxage=604800' } })
}
