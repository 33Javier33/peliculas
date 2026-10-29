import { NextRequest, NextResponse } from 'next/server'
import { readAudioLink } from '@/lib/audio-link'

// /api/audio-link?url=… → pistas de audio de ese enlace (archivo, lista o página)
export const runtime = 'nodejs'
export const maxDuration = 20

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url') || ''
  if (!url) return NextResponse.json({ error: 'Falta el enlace' }, { status: 400 })
  try {
    const tracks = await readAudioLink(url)
    if (tracks.length === 0) return NextResponse.json({ error: 'No se encontraron archivos de audio en ese enlace', tracks: [] }, { status: 404 })
    return NextResponse.json({ tracks })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || 'No se pudo leer el enlace', tracks: [] }, { status: 400 })
  }
}
