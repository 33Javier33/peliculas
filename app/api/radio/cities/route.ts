import { NextRequest, NextResponse } from 'next/server'
import { getRadioCities } from '@/lib/live'

// /api/radio/cities?country=CL → ciudades/regiones con emisoras
export async function GET(request: NextRequest) {
  const country = (request.nextUrl.searchParams.get('country') || '').toUpperCase()
  if (!/^[A-Z]{2}$/.test(country)) return NextResponse.json({ cities: [] })
  const cities = await getRadioCities(country).catch(() => [])
  return NextResponse.json({ cities }, { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=172800' } })
}
