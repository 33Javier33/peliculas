import { NextRequest, NextResponse } from 'next/server'
import { getSharedVideo } from '@/lib/youtube-music'

// /api/yt-info?id=VIDEO_ID → título, canal y carátula de un video (oEmbed: no gasta cuota)
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id') || ''
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 })
  const v = await getSharedVideo(id)
  return NextResponse.json(
    { id, title: v.title, channelTitle: v.channelTitle, thumbnail: v.thumbnail },
    { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } }
  )
}
