// Misma firma que lib/hls-sign.ts, pero con Web Crypto para el intermediario /api/hls,
// que corre en Edge (cerca del usuario: menos demora y los canales con bloqueo por país
// ven una conexión sudamericana en vez de una de Estados Unidos).
import type { StreamHeaders } from '@/lib/hls-sign'

const SECRET = process.env.HLS_PROXY_SECRET || 'cpn-hls-proxy-default-secret'

let keyPromise: Promise<CryptoKey> | null = null
const key = () =>
  (keyPromise ??= crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]))

function base64url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sign(url: string, h: StreamHeaders): Promise<string> {
  const data = new TextEncoder().encode(`${url}\n${h.referrer || ''}\n${h.userAgent || ''}`)
  const mac = await crypto.subtle.sign('HMAC', await key(), data)
  return base64url(new Uint8Array(mac)).slice(0, 32)
}

export async function proxiedUrl(url: string, h: StreamHeaders = {}): Promise<string> {
  const params = new URLSearchParams({ u: url, s: await sign(url, h) })
  if (h.referrer) params.set('r', h.referrer)
  if (h.userAgent) params.set('a', h.userAgent)
  return `/api/hls?${params.toString()}`
}

export async function verify(url: string, h: StreamHeaders, signature: string): Promise<boolean> {
  const expected = await sign(url, h)
  if (!signature || expected.length !== signature.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  return diff === 0
}
