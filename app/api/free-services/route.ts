import { NextRequest, NextResponse } from 'next/server'
import { getFreeServiceRows } from '@/lib/tmdb'
import { getRequestRegion } from '@/lib/region'

// /api/free-services → películas gratis en Plex, Tubi y Runtime en el país del usuario
export async function GET(request: NextRequest) {
  const country = getRequestRegion(request, 'CL')
  try {
    const rows = await getFreeServiceRows(country)
    return NextResponse.json({ country, rows }, { headers: { 'Cache-Control': 'private, max-age=3600' } })
  } catch (err) {
    return NextResponse.json({ country, rows: [], error: (err as Error).message }, { status: 502 })
  }
}
