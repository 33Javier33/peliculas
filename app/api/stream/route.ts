import { NextRequest } from 'next/server'
import { resolveOwnAudio } from '@/lib/own-stream'

// /api/stream?id=VIDEO_ID → el audio de la canción, reenviado por el servidor de la app
// (con soporte de Range para adelantar y para continuar si la conexión se corta).
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') || ''
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return new Response('id inválido', { status: 400 })

  const range = req.headers.get('range') || 'bytes=0-'
  for (let attempt = 0; attempt < 2; attempt++) {
    let audio
    try {
      audio = await resolveOwnAudio(id, attempt > 0)
    } catch (err) {
      return new Response(`Audio no disponible: ${(err as Error).message}`, { status: 502 })
    }
    const upstream = await fetch(audio.url, { headers: { Range: range, 'User-Agent': audio.userAgent }, cache: 'no-store' }).catch(() => null)
    // Dirección vencida o rechazada: se pide una nueva una vez
    if (!upstream || upstream.status === 403 || upstream.status === 410) continue
    if (!upstream.ok && upstream.status !== 206) return new Response('Audio no disponible', { status: upstream.status })

    const headers = new Headers({
      'Content-Type': audio.mimeType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    })
    for (const h of ['content-length', 'content-range']) {
      const v = upstream.headers.get(h)
      if (v) headers.set(h, v)
    }
    return new Response(upstream.body, { status: upstream.status, headers })
  }
  return new Response('Audio no disponible', { status: 502 })
}
