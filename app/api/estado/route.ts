import { NextRequest, NextResponse } from 'next/server'
import { getPlutoChannels, getPlutoMovies } from '@/lib/pluto'
import { getNationalChannels } from '@/lib/tv'
import { getRadiosByCountry } from '@/lib/live'
import { searchCatalog } from '@/lib/catalog'
import { findAudioCandidates } from '@/lib/audio-sources'
import { publicSearch } from '@/lib/public-search'
import { searchMusicVideos } from '@/lib/youtube-music'
import { getPopularMovies } from '@/lib/tmdb'
import { searchArchiveMovies } from '@/lib/archive'
import { searchArchiveAudio } from '@/lib/archive-audio'
import { getArtistInfo, lastWikiError } from '@/lib/music-info'
import { getRequestRegion } from '@/lib/region'
import { resolveOwnAudio } from '@/lib/own-stream'

// Diagnóstico de todas las fuentes que usa la app, probadas desde el servidor real (Vercel).
export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface Check {
  id: string
  area: string
  name: string
  ok: boolean
  ms: number
  detail: string
}

async function check(id: string, area: string, name: string, fn: () => Promise<string>, timeout = 25000): Promise<Check> {
  const t0 = Date.now()
  try {
    const detail = await Promise.race([
      fn(),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error(`sin respuesta en ${timeout / 1000} s`)), timeout)),
    ])
    return { id, area, name, ok: true, ms: Date.now() - t0, detail }
  } catch (err) {
    return { id, area, name, ok: false, ms: Date.now() - t0, detail: (err as Error).message || 'error' }
  }
}

const need = (n: number, what: string) => {
  if (n === 0) throw new Error(`0 ${what}`)
  return `${n} ${what}`
}

export async function GET(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || request.headers.get('x-real-ip')
  const cc = getRequestRegion(request)

  const checks = await Promise.all([
    check('pluto-tv', 'TV', 'Pluto TV · canales', async () => need((await getPlutoChannels(ip || null, cc)).length, 'canales')),
    check('pluto-vod', 'Películas', 'Pluto TV · películas', async () => {
      const rows = await getPlutoMovies(ip || null)
      return need(rows.reduce((n, r) => n + r.movies.length, 0), `películas en ${rows.length} categorías`)
    }),
    check('tv-national', 'TV', `Canales nacionales (${cc})`, async () => need((await getNationalChannels(cc)).length, 'canales')),
    check('radio', 'Radio', `Radios de ${cc} (Radio Browser)`, async () => need((await getRadiosByCountry(cc, 20)).length, 'emisoras')),
    check('archive-audio', 'Música', 'Discos de Internet Archive', async () => need((await searchArchiveAudio('jazz')).results.length, 'discos')),
    check('free-music', 'Música', 'Música libre: Jamendo y Free Music Archive (archive.org)', async () =>
      need((await searchArchiveAudio('', 1, '', 'all', 'free')).results.length, 'discos')
    ),
    check('deezer', 'Música', 'Catálogo de álbumes (Deezer)', async () => {
      const r = await searchCatalog('Shakira')
      return need(r.artists.length + r.albums.length, 'resultados')
    }),
    check('youtube-api', 'Música', 'Búsqueda oficial de YouTube', async () => {
      const r = await searchMusicVideos('Shakira', undefined, 5)
      return need(r.videos.length, 'videos') + (r.nextPageToken?.startsWith('pub:') ? ' (por respaldo, sin cuota oficial)' : '')
    }),
    check('youtube-public', 'Música', 'Búsqueda de respaldo (Piped/Invidious)', async () => need((await publicSearch('Shakira Hips')).length, 'videos')),
    check('own-audio', 'Música', 'Audio propio de la app (pantalla bloqueada)', async () => {
      // Dos videos conocidos (Despacito y Waka Waka)
      let a
      try {
        a = await resolveOwnAudio('kJQP7kiw5Fk', true)
      } catch {
        a = await resolveOwnAudio('pRpeEdMmmQ0', true)
      }
      const r = await fetch(a.url, { headers: { Range: 'bytes=0-1023', 'User-Agent': a.userAgent } })
      if (r.status !== 206 && !r.ok) throw new Error(`YouTube respondió ${r.status} al bajar el audio (${a.client})`)
      return `audio ${a.mimeType} · ${Math.round(a.bitrate / 1000)} kbps · ${a.client}`
    }),
    check('audio', 'Música', 'Audio de respaldo (servidores públicos)', async () => need((await findAudioCandidates('pRpeEdMmmQ0')).length, 'fuentes de audio')),
    check('tmdb', 'Películas', 'Catálogo de películas (TMDB)', async () => need((await getPopularMovies(1)).results.length, 'películas')),
    check('archive', 'Películas', 'Clásicos (Internet Archive)', async () => need((await searchArchiveMovies('es')).length, 'películas')),
    check('wikipedia', 'Música', 'Biografías (Wikipedia)', async () => {
      const info = await getArtistInfo('Shakira')
      if (!info) throw new Error(`sin resultado${lastWikiError ? ` (${lastWikiError})` : ''}`)
      return `biografía encontrada: ${info.title}`
    }),
  ])

  return NextResponse.json({ at: new Date().toISOString(), region: cc, checks }, { headers: { 'Cache-Control': 'no-store' } })
}
