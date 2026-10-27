import { NextResponse } from 'next/server'
import { getPlayableAlbum } from '@/lib/catalog'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Canciones del álbum listas para reproducir (IDs de YouTube)
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!/^\d{1,15}$/.test(params.id)) return NextResponse.json({ tracks: [] }, { status: 400 })
  try {
    const tracks = await getPlayableAlbum(params.id)
    return NextResponse.json({ tracks })
  } catch {
    return NextResponse.json({ tracks: [] }, { status: 502 })
  }
}
