import { NextRequest, NextResponse } from 'next/server'
import { getRadiosByCountry, getRadiosByCity, getTopRadios, searchRadios, getNearbyRadios } from '@/lib/live'
import { getRequestRegion } from '@/lib/region'

// /api/radio?country=CL | ?country=world | ?q=nombre o ciudad[&country=CL] | ?city=Santiago&country=CL
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const q = searchParams.get('q')?.trim().slice(0, 80) || ''
  const countryParam = (searchParams.get('country') || '').toUpperCase()
  const country = countryParam === 'WORLD' ? '' : /^[A-Z]{2}$/.test(countryParam) ? countryParam : getRequestRegion(request)

  const city = searchParams.get('city')?.trim().slice(0, 80) || ''

  // "Cerca de mí": coordenadas del GPS (lat/lon) o, si no hay permiso, las aproximadas de la IP
  if (searchParams.get('near')) {
    const latParam = parseFloat(searchParams.get('lat') || '')
    const lonParam = parseFloat(searchParams.get('lon') || '')
    const hasGps = isFinite(latParam) && isFinite(lonParam) && Math.abs(latParam) <= 90 && Math.abs(lonParam) <= 180
    const lat = hasGps ? latParam : parseFloat(request.headers.get('x-vercel-ip-latitude') || '')
    const lon = hasGps ? lonParam : parseFloat(request.headers.get('x-vercel-ip-longitude') || '')
    const ipCityRaw = request.headers.get('x-vercel-ip-city')
    let ipCity: string | undefined
    try {
      ipCity = ipCityRaw ? decodeURIComponent(ipCityRaw) : undefined
    } catch {}
    const ipCountry = request.headers.get('x-vercel-ip-country') || undefined
    const headers = { 'Cache-Control': 'private, no-store' }
    if (!isFinite(lat) || !isFinite(lon)) {
      return NextResponse.json({ stations: [], near: { source: 'none' } }, { headers })
    }
    try {
      const stations = await getNearbyRadios(lat, lon, hasGps ? undefined : ipCity, ipCountry)
      return NextResponse.json(
        { stations, near: { source: hasGps ? 'gps' : 'ip', city: hasGps ? undefined : ipCity } },
        { headers }
      )
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message, stations: [], near: { source: 'none' } }, { status: 502, headers })
    }
  }

  try {
    const stations = q
      ? await searchRadios(q, country || undefined)
      : city && country
        ? await getRadiosByCity(city, country)
      : country
        ? await getRadiosByCountry(country)
        : await getTopRadios()
    return NextResponse.json(
      { stations, country: country || 'WORLD' },
      // Sin país explícito el resultado depende de la IP: no cachear en la CDN
      { headers: { 'Cache-Control': countryParam ? 'public, s-maxage=3600, stale-while-revalidate=7200' : 'private, max-age=600' } }
    )
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message, stations: [], country: country || 'WORLD' }, { status: 502 })
  }
}
