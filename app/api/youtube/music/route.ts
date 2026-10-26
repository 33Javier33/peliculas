import { NextRequest, NextResponse } from 'next/server'
import { getTrendingMusicVideos, searchMusicVideos } from '@/lib/youtube-music'
import { getRequestRegion } from '@/lib/region'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const query = searchParams.get('q')?.trim() || ''
  const pageToken = searchParams.get('pageToken') || undefined
  const region = getRequestRegion(request)

  // El resultado depende del país del usuario: caché solo en el navegador
  // (la llamada a YouTube ya queda cacheada en el servidor por región).
  const headers = { 'Cache-Control': 'private, max-age=600' }

  try {
    if (query) {
      const result = await searchMusicVideos(query, pageToken, 20, region)
      return NextResponse.json({ ...result, region }, { headers })
    }
    let videos
    let used = region
    try {
      videos = await getTrendingMusicVideos(region)
      if (videos.length === 0) throw new Error('sin resultados')
    } catch {
      // Algunos países no tienen lista de música en YouTube: usamos México
      used = 'MX'
      videos = await getTrendingMusicVideos('MX')
    }
    return NextResponse.json({ videos, region: used }, { headers })
  } catch (err) {
    const message = (err as Error).message || 'Error desconocido'
    const status = message.includes('YOUTUBE_API_KEY') ? 500 : 502
    return NextResponse.json({ error: message }, { status })
  }
}
