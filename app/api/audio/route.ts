import { NextRequest, NextResponse } from 'next/server'
import { findAudioCandidates, isValidVideoId, type AudioCandidate } from '@/lib/audio-sources'
import { ownAudioAvailable } from '@/lib/own-stream'

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

  // Primero el audio propio de la app (/api/stream); después los servidores públicos de respaldo
  const own: AudioCandidate = { url: `/api/stream?id=${id}`, mimeType: 'audio/mp4', bitrate: 130000, source: 'app' }
  // Los públicos tienen 2,5 s; si tardan más se responde ya con el propio (y quedan en caché después)
  const publicJob = findAudioCandidates(id).catch(() => [] as AudioCandidate[])
  publicJob.then((list) => list.length && cache.set(id, { at: Date.now(), candidates: list }))
  const publicList = await Promise.race([publicJob, new Promise<AudioCandidate[]>((r) => setTimeout(r, 2500, []))])
  // El propio solo si YouTube no está rechazando al servidor
  const candidates = ownAudioAvailable() ? [...publicList, own] : publicList
  if (publicList.length > 0) {
    cache.set(id, { at: Date.now(), candidates })
    if (cache.size > 300) cache.delete(cache.keys().next().value as string)
  }
  return NextResponse.json({ candidates })
}
