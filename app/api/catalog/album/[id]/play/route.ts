import { NextResponse } from 'next/server'
import { getPlayableAlbum, getQuickAlbum } from '@/lib/catalog'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Canciones del álbum listas para reproducir (IDs de YouTube)
// ?quick=1 → al instante: canciones "pendientes" que se buscan justo antes de sonar
export async function GET(req: Request, { params }: { params: { id: string } }) {
  if (!/^\d{1,15}$/.test(params.id)) return NextResponse.json({ tracks: [] }, { status: 400 })
  try {
    const quick = new URL(req.url).searchParams.get('quick') === '1'
    const tracks = quick ? await getQuickAlbum(params.id) : await getPlayableAlbum(params.id)
    return NextResponse.json({ tracks })
  } catch {
    return NextResponse.json({ tracks: [] }, { status: 502 })
  }
}
