import { NextRequest, NextResponse } from 'next/server'
import { searchArchiveAudio, searchArchiveArtists, type ArchiveSearchBy } from '@/lib/archive-audio'

// /api/archive-audio?q=…&page=…&by=all|album|exactArtist → discos y grabaciones de Internet Archive
// /api/archive-audio?q=…&by=artist → artistas (con cuántos discos tienen)
export const runtime = 'nodejs'
export const maxDuration = 20

const BY: ArchiveSearchBy[] = ['all', 'artist', 'album', 'exactArtist']

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const q = (sp.get('q') || '').slice(0, 120)
  const page = Math.max(1, Math.min(20, Number(sp.get('page')) || 1))
  const by = (BY as string[]).includes(sp.get('by') || '') ? (sp.get('by') as ArchiveSearchBy) : 'all'
  const cache = { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' }
  try {
    if (by === 'artist') return NextResponse.json({ artists: await searchArchiveArtists(q) }, { headers: cache })
    const collection = (sp.get('collection') || '').slice(0, 60)
    const data = await searchArchiveAudio(q, page, collection, by)
    return NextResponse.json(data, { headers: cache })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || 'No se pudo buscar', results: [], artists: [], total: 0 }, { status: 502 })
  }
}
