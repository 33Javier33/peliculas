import { NextRequest } from 'next/server'

// /api/img?u=URL → una carátula reenviada por el servidor de la app. Sirve para que el teléfono
// la guarde (algunos sitios, como YouTube, no dejan guardarlas directamente) y se vea sin internet.
export const runtime = 'nodejs'

const HOSTS = [
  'ytimg.com', 'ggpht.com', 'googleusercontent.com', 'dzcdn.net', 'deezer.com', 'archive.org', 'us.archive.org',
  'jamendo.com', 'freemusicarchive.org', 'mzstatic.com', 'tmdb.org', 'wikimedia.org', 'wikipedia.org',
  'nts.live', 'ntslive.co.uk', 'imgix.net', 'scdn.co', 'last.fm', 'lastfm.freetls.fastly.net', 'coverartarchive.org',
]

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('u') || ''
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return new Response('url inválida', { status: 400 })
  }
  const host = url.hostname.toLowerCase()
  if (url.protocol !== 'https:' || !HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return new Response('no permitido', { status: 403 })
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 12000)
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 PulsoMedia' } })
    const type = r.headers.get('content-type') || ''
    if (!r.ok || !type.startsWith('image/')) return new Response('sin imagen', { status: 502 })
    const buf = await r.arrayBuffer()
    if (buf.byteLength > 6 * 1024 * 1024) return new Response('muy grande', { status: 413 })
    return new Response(buf, { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=2592000, s-maxage=2592000, immutable' } })
  } catch {
    return new Response('sin imagen', { status: 504 })
  } finally {
    clearTimeout(t)
  }
}
