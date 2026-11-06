import { NextRequest, NextResponse } from 'next/server'
import { smartShuffle } from '@/lib/smart-shuffle'
import type { MusicVideo } from '@/lib/youtube-music'

// Comunidad de playlists (lo que cada usuario decidió compartir, guardado en el Sheet de cuentas).
//   /api/comunidad            → playlists compartidas (sin canciones) y mezclas por género
//   /api/comunidad?id=ID      → canciones de una playlist compartida
//   /api/comunidad?mix=rock   → mezcla de la comunidad de ese género (canciones de todos)
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const GAS_URL =
  process.env.CUENTA_GAS_URL ||
  'https://script.google.com/macros/s/AKfycbyqgT_H1zaJcbMVGK_sieVFe91WsSqSDwU5VygB1SFW5DX-9AhO0DDuAWoxIfrYcGjGEw/exec'

type Track = MusicVideo & { g?: string }
interface Shared {
  id: string
  alias: string
  name: string
  genre: string
  kind: string
  tracks: Track[]
  updated: number
}

const LABELS: Record<string, string> = {
  latina: 'Latina', rock: 'Rock', pop: 'Pop', electronica: 'Electrónica', jazz: 'Jazz', blues: 'Blues y soul', clasica: 'Clásica',
  hiphop: 'Hip hop', reggae: 'Reggae y ska', folk: 'Folk y country', metal: 'Metal', ambient: 'Relajo',
}

// Se guarda unos minutos en memoria: el Sheet tarda en responder
let cache: { at: number; list: Shared[] } | null = null
async function all(): Promise<Shared[] | null> {
  if (cache && Date.now() - cache.at < 2 * 60 * 1000) return cache.list
  const res = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'community' }),
    redirect: 'follow',
    cache: 'no-store',
    signal: AbortSignal.timeout(25000),
  }).catch(() => null)
  const d = (await res?.json().catch(() => null)) as { ok?: boolean; playlists?: Shared[]; error?: string } | null
  if (!d?.ok || !Array.isArray(d.playlists)) return cache?.list ?? null
  const list = d.playlists.filter((p) => p.tracks?.length)
  cache = { at: Date.now(), list }
  return list
}

const cover = (p: Shared) => p.tracks.find((t) => t.thumbnail?.startsWith('http'))?.thumbnail

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const list = await all()
  // El servidor de cuentas todavía no tiene la comunidad (hay que actualizar el Apps Script)
  if (!list) return NextResponse.json({ ok: false, error: 'unavailable', playlists: [], mixes: [] })

  // Búsqueda: playlists (por nombre, quién la compartió, género o sus canciones) y canciones
  const q = (sp.get('q') || '').trim()
  if (q) {
    const norm = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    const n = norm(q)
    const has = (x?: string) => !!x && norm(x).includes(n)
    const songs: (Track & { from: string; fromId: string })[] = []
    const seen = new Set<string>()
    const playlists = list.filter((p) => {
      const byName = has(p.name) || has(p.alias) || has(LABELS[p.genre] || p.genre)
      let bySong = false
      for (const t of p.tracks)
        if (has(t.title) || has(t.channelTitle) || has(t.album)) {
          bySong = true
          const key = norm(t.title)
          if (!seen.has(key) && songs.length < 60) {
            seen.add(key)
            songs.push({ ...t, from: p.name, fromId: p.id })
          }
        }
      return byName || bySong
    })
    return NextResponse.json({
      ok: true,
      playlists: playlists.slice(0, 40).map((p) => ({ id: p.id, alias: p.alias, name: p.name, genre: p.genre, kind: p.kind, count: p.tracks.length, cover: cover(p), updated: p.updated })),
      songs,
    })
  }

  const id = sp.get('id')
  if (id) {
    const p = list.find((x) => x.id === id)
    return p ? NextResponse.json({ ok: true, playlist: p }) : NextResponse.json({ ok: false, error: 'No existe' }, { status: 404 })
  }

  // Mezclas por género: las canciones de ese género de todas las playlists compartidas
  const byGenre = new Map<string, Map<string, Track>>()
  for (const p of list)
    for (const t of p.tracks) {
      const g = t.g || p.genre
      if (!g || !LABELS[g]) continue
      if (!byGenre.has(g)) byGenre.set(g, new Map())
      // La misma canción compartida por varias personas suena una vez (aunque venga de otro video)
      const key = t.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\([^)]*\)|\[[^\]]*\]/g, '').replace(/[^a-z0-9]+/g, ' ').trim() || t.id
      if (!byGenre.get(g)!.has(key)) byGenre.get(g)!.set(key, t)
    }
  const mix = sp.get('mix')
  if (mix) {
    const tracks = smartShuffle(Array.from(byGenre.get(mix)?.values() ?? [])).slice(0, 150)
    return NextResponse.json({ ok: true, mix: { genre: mix, label: LABELS[mix] || mix, tracks } })
  }

  const mixes = Array.from(byGenre.entries())
    .filter(([, m]) => m.size >= 5)
    .map(([g, m]) => ({ genre: g, label: LABELS[g], count: m.size, cover: Array.from(m.values()).find((t) => t.thumbnail?.startsWith('http'))?.thumbnail }))
    .sort((a, b) => b.count - a.count)
  const playlists = list
    .sort((a, b) => b.updated - a.updated)
    .map((p) => ({ id: p.id, alias: p.alias, name: p.name, genre: p.genre, kind: p.kind, count: p.tracks.length, cover: cover(p), updated: p.updated }))
  return NextResponse.json({ ok: true, playlists, mixes }, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } })
}
