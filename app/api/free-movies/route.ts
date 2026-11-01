import { NextRequest, NextResponse } from 'next/server'
import { getPlutoMovies } from '@/lib/pluto'
import { searchArchiveMovies, getArchiveVideo, getArchiveSubtitle, ARCHIVE_GENRES } from '@/lib/archive'
import { searchCommonsMovies } from '@/lib/commons'

// Películas completas, gratis y legales:
//   ?source=pluto                                            → filas por categoría (Pluto TV a la carta)
//   ?source=archive&kind=es|classic&genre=&sort=&q=&page=    → Internet Archive (dominio público)
//   ?source=commons&kind=es|classic&q=&page=                 → Wikimedia Commons (dominio público)
//   ?archive=ID                                              → video, descarga y subtítulos de esa película
//   ?sub=ID&file=NOMBRE                                      → subtítulos en WebVTT
export const maxDuration = 30

const CACHE = { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400' }

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams
  try {
    const sub = p.get('sub')
    if (sub) {
      const vtt = await getArchiveSubtitle(sub, p.get('file') || '')
      return vtt
        ? new NextResponse(vtt, { headers: { 'Content-Type': 'text/vtt; charset=utf-8', ...CACHE } })
        : NextResponse.json({ error: 'Sin subtítulos' }, { status: 404 })
    }

    const archiveId = p.get('archive')
    if (archiveId) {
      const video = await getArchiveVideo(archiveId)
      return video ? NextResponse.json(video, { headers: CACHE }) : NextResponse.json({ error: 'Sin video' }, { status: 404 })
    }

    const page = Math.max(1, Math.min(50, Number(p.get('page')) || 1))
    const kind = p.get('kind') === 'classic' ? 'classic' : 'es'
    const q = (p.get('q') || '').slice(0, 100)

    if (p.get('source') === 'archive') {
      const genre = p.get('genre') || ''
      const sort = p.get('sort')
      const movies = await searchArchiveMovies({
        kind,
        q,
        page,
        genre: ARCHIVE_GENRES[genre] ? genre : undefined,
        sort: sort === 'new' || sort === 'old' ? sort : 'popular',
      })
      return NextResponse.json({ movies }, { headers: CACHE })
    }

    if (p.get('source') === 'commons') {
      const movies = await searchCommonsMovies(kind, q, page)
      return NextResponse.json({ movies }, { headers: CACHE })
    }

    // Pluto depende de la IP (país) de quien mira: no va a la caché compartida
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || request.headers.get('x-real-ip')
    const rows = await getPlutoMovies(ip || null)
    return NextResponse.json({ rows }, { headers: { 'Cache-Control': 'private, max-age=1800' } })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 })
  }
}
