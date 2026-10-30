import { NextRequest, NextResponse } from 'next/server'
import { playOnScreen } from '@/lib/yt-lounge'

// POST { screenId, videoId, currentTime } → la TV (con YouTube abierto) reproduce ese video
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  let body: { screenId?: string; videoId?: string; currentTime?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  }
  const { screenId = '', videoId = '', currentTime = 0 } = body
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId) || !/^[A-Za-z0-9_.:-]{8,200}$/.test(screenId)) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  }
  try {
    await playOnScreen(screenId, videoId, Number(currentTime) || 0)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || 'No se pudo enviar a la TV' }, { status: 502 })
  }
}
