import { NextRequest, NextResponse } from 'next/server'
import { bestArchiveFile } from '@/lib/audio-link'

// /api/archive-best?u=ARCHIVO → lleva (302) al archivo de mejor calidad de esa canción en
// archive.org (FLAC, MP3 320, original…). Con &json=1 responde la dirección.
export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u') || ''
  if (!/^https:\/\/([a-z0-9-]+\.)*archive\.org\/download\//i.test(u)) return NextResponse.json({ error: 'url inválida' }, { status: 400 })
  const best = await bestArchiveFile(u).catch(() => u)
  if (req.nextUrl.searchParams.get('json') === '1')
    return NextResponse.json({ url: best }, { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } })
  return NextResponse.redirect(best, { status: 302, headers: { 'Cache-Control': 'public, s-maxage=86400' } })
}
