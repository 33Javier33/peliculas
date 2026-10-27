import { NextRequest } from 'next/server'
import { proxiedUrl, verify } from '@/lib/hls-sign-edge'

export const dynamic = 'force-dynamic'
// Edge: arranca al instante (sin "arranque en frío") y corre cerca del usuario
export const runtime = 'edge'

// Intermediario de video en vivo (HLS): permite ver canales que emiten por http (el
// navegador los bloquea en una página https), que no permiten reproducirse desde otra
// web (CORS) o que exigen un Referer / User-Agent. Las listas .m3u8 se reescriben para
// que cada segmento también pase por aquí, siempre con su firma.

const CORS = { 'Access-Control-Allow-Origin': '*' }
// Los segmentos no cambian: quedan en la red de Vercel para el resto de quienes miran
const SEGMENT_CACHE = 'public, max-age=60, s-maxage=120'

// Segmentos de video/audio: se reenvían sin esperar a que terminen de bajar
const isSegment = (url: string) => /\.(ts|aac|m4s|mp4|m4a|m4v|mp3|vtt|webvtt|key)(\?|$)/i.test(url)

function isPlaylist(url: string, contentType: string, head: string) {
  return /mpegurl/i.test(contentType) || /\.m3u8?(\?|$)/i.test(url) || head.startsWith('#EXTM3U')
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const url = p.get('u') || ''
  const headers = { referrer: p.get('r') || undefined, userAgent: p.get('a') || undefined }
  if (!/^https?:\/\//i.test(url) || !(await verify(url, headers, p.get('s') || ''))) {
    return new Response('Firma no válida', { status: 403, headers: CORS })
  }

  let upstream: Response
  try {
    upstream = await fetch(url, {
      headers: {
        'User-Agent': headers.userAgent || 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
        ...(headers.referrer ? { Referer: headers.referrer, Origin: new URL(headers.referrer).origin } : {}),
      },
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(isSegment(url) ? 20000 : 10000),
    })
  } catch {
    return new Response('Canal no disponible', { status: 502, headers: CORS })
  }
  if (!upstream.ok) return new Response('Canal no disponible', { status: upstream.status, headers: CORS })

  const contentType = upstream.headers.get('content-type') || ''
  const finalUrl = upstream.url || url

  // ¿Lista de reproducción? Se reescribe; si no, se reenvía el segmento tal cual
  if (!isSegment(finalUrl) && (/mpegurl|text|octet-stream/i.test(contentType) || /\.m3u8?(\?|$)/i.test(finalUrl))) {
    const buffer = await upstream.arrayBuffer()
    const head = new TextDecoder().decode(buffer.slice(0, 16))
    if (isPlaylist(finalUrl, contentType, head)) {
      const text = new TextDecoder().decode(buffer)
      const abs = (u: string) => new URL(u, finalUrl).toString()
      const lines = await Promise.all(
        text.split(/\r?\n/).map(async (line) => {
          const t = line.trim()
          if (!t) return line
          if (t.startsWith('#')) {
            // URI="…" dentro de etiquetas (claves de cifrado, audios, subtítulos, mapas)
            const uris = Array.from(line.matchAll(/URI="([^"]+)"/g), (m) => m[1])
            let out = line
            for (const u of uris) out = out.replace(`URI="${u}"`, `URI="${await proxiedUrl(abs(u), headers)}"`)
            return out
          }
          return proxiedUrl(abs(t), headers)
        })
      )
      // La lista cambia cada pocos segundos: se comparte un instante entre quienes miran el mismo canal
      return new Response(lines.join('\n'), {
        headers: { ...CORS, 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'public, max-age=1, s-maxage=2' },
      })
    }
    return new Response(buffer, { headers: { ...CORS, 'Content-Type': contentType || 'video/mp2t', 'Cache-Control': SEGMENT_CACHE } })
  }

  return new Response(upstream.body, {
    headers: { ...CORS, 'Content-Type': contentType || 'video/mp2t', 'Cache-Control': SEGMENT_CACHE },
  })
}
