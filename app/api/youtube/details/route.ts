import { NextRequest, NextResponse } from 'next/server'
import { getVideoDetails } from '@/lib/youtube'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const ids = searchParams.get('ids') || ''

  if (!ids.trim()) {
    return NextResponse.json({ items: [] })
  }

  const videoIds = ids
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 50)

  try {
    const data = await getVideoDetails(videoIds)
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
      },
    })
  } catch (err) {
    const message = (err as Error).message || 'Error al obtener detalles'
    return NextResponse.json({ error: message, items: [] }, { status: 502 })
  }
}
