import { NextRequest, NextResponse } from 'next/server'
import { getTrendingMusicVideos, searchMusicVideos } from '@/lib/youtube-music'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const query = searchParams.get('q')?.trim() || ''
  const pageToken = searchParams.get('pageToken') || undefined

  try {
    if (query) {
      const result = await searchMusicVideos(query, pageToken)
      return NextResponse.json(result, {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        },
      })
    } else {
      const videos = await getTrendingMusicVideos()
      return NextResponse.json(
        { videos },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
          },
        }
      )
    }
  } catch (err) {
    const message = (err as Error).message || 'Error desconocido'
    const status = message.includes('YOUTUBE_API_KEY') ? 500 : 502
    return NextResponse.json({ error: message }, { status })
  }
}
