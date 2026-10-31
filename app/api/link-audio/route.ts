import { NextRequest, NextResponse } from 'next/server'
import { assertPublic } from '@/lib/audio-link'
import { proxiedUrl } from '@/lib/hls-sign'

// /api/link-audio?u=… → el mismo audio por el intermediario de la app. Se usa cuando un MP3
// (p. ej. de archive.org) no carga directo en el teléfono: el servidor lo trae y lo entrega.
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const u = request.nextUrl.searchParams.get('u') || ''
  try {
    const url = await assertPublic(u)
    return NextResponse.redirect(new URL(proxiedUrl(url.toString()), request.url), 302)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
