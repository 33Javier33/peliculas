import { NextRequest, NextResponse } from 'next/server'
import { getInstances, fetchJson } from '@/lib/audio-sources'
import { searchMovies } from '@/lib/tmdb'
import { getRequestRegion } from '@/lib/region'

// Sugerencias de búsqueda mientras se escribe.
// /api/suggest?kind=music|video|movies|radio&q=texto
// - music/video: autocompletado de YouTube (sin clave ni cuota) y, de respaldo, Invidious
// - movies: títulos de TMDB
// - radio: nombres de emisoras de Radio Browser

const MAX = 8

async function youtubeSuggest(q: string, region: string): Promise<string[]> {
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&hl=es&gl=${region}&q=${encodeURIComponent(q)}`
  const res = await fetch(url, { next: { revalidate: 86400 } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  // La respuesta puede venir en ISO-8859-1: se decodifica según su charset
  const charset = res.headers.get('content-type')?.match(/charset=([^;]+)/i)?.[1] || 'utf-8'
  const text = new TextDecoder(charset).decode(await res.arrayBuffer())
  const data = JSON.parse(text) as [string, string[]]
  return Array.isArray(data?.[1]) ? data[1] : []
}

async function invidiousSuggest(q: string): Promise<string[]> {
  const { invidious } = await getInstances()
  return Promise.any(
    invidious.slice(0, 4).map((base) =>
      fetchJson<{ suggestions?: string[] }>(`${base}/api/v1/search/suggestions?q=${encodeURIComponent(q)}`, 4000).then((d) =>
        d.suggestions?.length ? d.suggestions : Promise.reject(new Error('vacío'))
      )
    )
  ).catch(() => [])
}

async function radioSuggest(q: string): Promise<string[]> {
  const servers = ['https://de1.api.radio-browser.info', 'https://nl1.api.radio-browser.info', 'https://at1.api.radio-browser.info']
  for (const base of servers) {
    try {
      const res = await fetch(
        `${base}/json/stations/search?name=${encodeURIComponent(q)}&hidebroken=true&order=clickcount&reverse=true&limit=20`,
        { headers: { 'User-Agent': 'CarlosPNautoInteractive/1.0' }, next: { revalidate: 86400 } }
      )
      if (!res.ok) continue
      const list = (await res.json()) as { name: string }[]
      return list.map((s) => s.name.trim())
    } catch {}
  }
  return []
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const q = (searchParams.get('q') || '').trim().slice(0, 100)
  const kind = searchParams.get('kind') || 'music'
  if (q.length < 2) return NextResponse.json({ suggestions: [] })

  let suggestions: string[] = []
  try {
    if (kind === 'movies') {
      const data = await searchMovies(q)
      suggestions = data.results.map((m) => m.title)
    } else if (kind === 'radio') {
      suggestions = await radioSuggest(q)
    } else {
      suggestions = await youtubeSuggest(q, getRequestRegion(request)).catch(() => invidiousSuggest(q))
      if (suggestions.length === 0) suggestions = await invidiousSuggest(q)
    }
  } catch {
    suggestions = []
  }

  // Sin repetidos (ignorando mayúsculas) y como máximo 8
  const seen = new Set<string>()
  suggestions = suggestions
    .filter((s) => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()))
    .slice(0, MAX)

  return NextResponse.json({ suggestions }, { headers: { 'Cache-Control': 'private, max-age=3600' } })
}
