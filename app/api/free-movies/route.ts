import { NextRequest, NextResponse } from 'next/server'
import { getPlutoMovies } from '@/lib/pluto'
import { searchArchiveMovies, getArchiveVideoUrl } from '@/lib/archive'

// Películas completas, gratis y legales:
//   ?source=pluto                              → filas por categoría (Pluto TV a la carta)
//   ?source=archive&kind=es|classic&q=&page=   → clásicos de Internet Archive
//   ?archive=ID                                → dirección del MP4 de esa película
export const maxDuration = 30

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams
  try {
    const archiveId = p.get('archive')
    if (archiveId) {
      const url = await getArchiveVideoUrl(archiveId)
      return url
        ? NextResponse.json({ url }, { headers: { 'Cache-Control': 'public, s-maxage=86400' } })
        : NextResponse.json({ error: 'Sin video' }, { status: 404 })
    }

    if (p.get('source') === 'archive') {
      const kind = p.get('kind') === 'classic' ? 'classic' : 'es'
      const page = Math.max(1, Math.min(50, Number(p.get('page')) || 1))
      const movies = await searchArchiveMovies(kind, p.get('q') || '', page)
      return NextResponse.json({ movies }, { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400' } })
    }

    // Pluto depende de la IP (país) de quien mira: no va a la caché compartida
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || request.headers.get('x-real-ip')
    const rows = await getPlutoMovies(ip || null)
    return NextResponse.json({ rows }, { headers: { 'Cache-Control': 'private, max-age=1800' } })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 })
  }
}
