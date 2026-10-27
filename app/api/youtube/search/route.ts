import { NextRequest, NextResponse } from 'next/server'
import { searchMoviesOnYouTube, getTrendingMoviesOnYouTube, parseVideoLang } from '@/lib/youtube'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const query = searchParams.get('q')?.trim() || ''
  const pageToken = searchParams.get('pageToken') || undefined
  // Idioma: latino (por defecto), castellano o ingles
  const lang = parseVideoLang(searchParams.get('lang'))

  try {
    const data = query
      ? await searchMoviesOnYouTube(query, pageToken, lang)
      : await getTrendingMoviesOnYouTube(lang, pageToken)

    return NextResponse.json(
      { items: data.items, nextPageToken: data.nextPageToken },
      {
        headers: {
          'Cache-Control': query
            ? 'public, s-maxage=300, stale-while-revalidate=600'
            : 'public, s-maxage=3600, stale-while-revalidate=7200',
        },
      }
    )
  } catch (err) {
    const message = (err as Error).message || 'Error desconocido'
    const status = message.includes('YOUTUBE_API_KEY') ? 500 : 502
    return NextResponse.json({ error: message }, { status })
  }
}
