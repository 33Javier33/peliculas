import { NextRequest, NextResponse } from 'next/server'
import { findAudioCandidates, isValidVideoId, type AudioCandidate } from '@/lib/audio-sources'

export const dynamic = 'force-dynamic'

// Caché en memoria: las URLs de audio duran varias horas.
const cache = new Map<string, { at: number; candidates: AudioCandidate[] }>()
const TTL_MS = 60 * 60 * 1000

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!isValidVideoId(id)) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 })
  }

  const hit = cache.get(id)
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json({ candidates: hit.candidates })
  }

  const candidates = await findAudioCandidates(id).catch(() => [])
  if (candidates.length > 0) {
    cache.set(id, { at: Date.now(), candidates })
    if (cache.size > 300) cache.delete(cache.keys().next().value as string)
  }
  return NextResponse.json({ candidates })
}
