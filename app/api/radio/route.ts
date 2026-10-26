import { NextRequest, NextResponse } from 'next/server'
import { getRadiosByCountry, getTopRadios, searchRadios } from '@/lib/live'
import { getRequestRegion } from '@/lib/region'

// /api/radio?country=CL | ?country=world | ?q=nombre[&country=CL]
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const q = searchParams.get('q')?.trim().slice(0, 80) || ''
  const countryParam = (searchParams.get('country') || '').toUpperCase()
  const country = countryParam === 'WORLD' ? '' : /^[A-Z]{2}$/.test(countryParam) ? countryParam : getRequestRegion(request)

  try {
    const stations = q
      ? await searchRadios(q, country || undefined)
      : country
        ? await getRadiosByCountry(country)
        : await getTopRadios()
    return NextResponse.json(
      { stations, country: country || 'WORLD' },
      // Sin país explícito el resultado depende de la IP: no cachear en la CDN
      { headers: { 'Cache-Control': countryParam ? 'public, s-maxage=3600, stale-while-revalidate=7200' : 'private, max-age=600' } }
    )
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message, stations: [] }, { status: 502 })
  }
}
