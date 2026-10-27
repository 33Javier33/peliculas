import { NextRequest } from 'next/server'
import { proxiedUrl, verify } from '@/lib/hls-sign'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Intermediario de video en vivo (HLS): permite ver canales que emiten por http (el
// navegador los bloquea en una página https), que no permiten reproducirse desde otra
// web (CORS) o que exigen un Referer / User-Agent. Las listas .m3u8 se reescriben para
// que cada segmento también pase por aquí, siempre con su firma.

const CORS = { 'Access-Control-Allow-Origin': '*' }

function isPlaylist(url: string, contentType: string, head: string) {
  return /mpegurl/i.test(contentType) || /\.m3u8?(\?|$)/i.test(url) || head.startsWith('#EXTM3U')
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const url = p.get('u') || ''
  const headers = { referrer: p.get('r') || undefined, userAgent: p.get('a') || undefined }
  if (!/^https?:\/\//i.test(url) || !verify(url, headers, p.get('s') || '')) {
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
    })
  } catch {
    return new Response('Canal no disponible', { status: 502, headers: CORS })
  }
  if (!upstream.ok) return new Response('Canal no disponible', { status: upstream.status, headers: CORS })

  const contentType = upstream.headers.get('content-type') || ''
  const finalUrl = upstream.url || url

  // ¿Lista de reproducción? Se reescribe; si no, se reenvía el segmento tal cual
  if (/mpegurl|text|octet-stream/i.test(contentType) || /\.m3u8?(\?|$)/i.test(finalUrl)) {
    const buffer = await upstream.arrayBuffer()
    const head = new TextDecoder().decode(buffer.slice(0, 16))
    if (isPlaylist(finalUrl, contentType, head)) {
      const text = new TextDecoder().decode(buffer)
      const abs = (u: string) => new URL(u, finalUrl).toString()
      const rewritten = text
        .split(/\r?\n/)
        .map((line) => {
          const t = line.trim()
          if (!t) return line
          if (t.startsWith('#')) {
            // URI="…" dentro de etiquetas (claves de cifrado, audios, subtítulos, mapas)
            return line.replace(/URI="([^"]+)"/g, (_, u) => `URI="${proxiedUrl(abs(u), headers)}"`)
          }
          return proxiedUrl(abs(t), headers)
        })
        .join('\n')
      return new Response(rewritten, {
        headers: { ...CORS, 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-cache' },
      })
    }
    return new Response(buffer, { headers: { ...CORS, 'Content-Type': contentType || 'video/mp2t', 'Cache-Control': 'public, max-age=30' } })
  }

  return new Response(upstream.body, {
    headers: { ...CORS, 'Content-Type': contentType || 'video/mp2t', 'Cache-Control': 'public, max-age=30' },
  })
}
