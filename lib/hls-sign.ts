// Firma de las direcciones que pasan por el intermediario de video (/api/hls).
// Solo el servidor de la app puede firmar, así el intermediario no lo puede usar nadie
// para otra cosa. Recomendado: definir HLS_PROXY_SECRET en Vercel.
import { createHmac, timingSafeEqual } from 'crypto'

const SECRET = process.env.HLS_PROXY_SECRET || 'cpn-hls-proxy-default-secret'

export interface StreamHeaders {
  referrer?: string
  userAgent?: string
}

function sign(url: string, h: StreamHeaders): string {
  return createHmac('sha256', SECRET)
    .update(`${url}\n${h.referrer || ''}\n${h.userAgent || ''}`)
    .digest('base64url')
    .slice(0, 32)
}

/** Dirección del intermediario para un stream (o un segmento) */
export function proxiedUrl(url: string, h: StreamHeaders = {}): string {
  const params = new URLSearchParams({ u: url, s: sign(url, h) })
  if (h.referrer) params.set('r', h.referrer)
  if (h.userAgent) params.set('a', h.userAgent)
  return `/api/hls?${params.toString()}`
}

export function verify(url: string, h: StreamHeaders, signature: string): boolean {
  const expected = Buffer.from(sign(url, h))
  const given = Buffer.from(signature || '')
  return expected.length === given.length && timingSafeEqual(expected, given)
}
