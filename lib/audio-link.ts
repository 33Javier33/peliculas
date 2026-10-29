// Enlaces de audio: un archivo (MP3, M4A, OGG, OPUS, WAV, FLAC, AAC), una lista (.m3u/.pls) o
// una página web que tenga enlaces a esos archivos. Se devuelve la lista de pistas listas para
// el reproductor. Los enlaces http (que el navegador bloquea en una web https) pasan por el
// intermediario de la app.
import { lookup } from 'dns/promises'
import { isIP } from 'net'
import { proxiedUrl } from '@/lib/hls-sign'

const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|weba)(\?|#|$)/i
const LIST_EXT = /\.(m3u8?|pls)(\?|#|$)/i
const MAX_PAGE = 2 * 1024 * 1024

export interface LinkTrack {
  title: string
  url: string
  /** Dirección para el reproductor (directa si es https; si no, por el intermediario) */
  playUrl: string
}

function isPrivate(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase()
    return v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:127.') || v === '::'
  }
  const [a, b] = ip.split('.').map(Number)
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
}

/** Solo direcciones públicas de internet (no la red interna del servidor) */
async function assertPublic(raw: string): Promise<URL> {
  const u = new URL(raw)
  if (!/^https?:$/.test(u.protocol)) throw new Error('Solo enlaces http o https')
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(u.hostname) && process.env.AUDIO_LINK_ALLOW_PRIVATE !== '1') throw new Error('Dirección no permitida')
  const ips = isIP(u.hostname) ? [u.hostname] : (await lookup(u.hostname, { all: true })).map((r) => r.address)
  // (AUDIO_LINK_ALLOW_PRIVATE solo para pruebas locales)
  if (ips.length === 0 || (ips.some(isPrivate) && process.env.AUDIO_LINK_ALLOW_PRIVATE !== '1')) throw new Error('Dirección no permitida')
  return u
}

const fileTitle = (u: string) => {
  try {
    const name = decodeURIComponent(new URL(u).pathname.split('/').pop() || '')
    return name.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_+]/g, ' ').trim() || 'Audio'
  } catch {
    return 'Audio'
  }
}

const playable = (url: string) => (url.startsWith('https://') ? url : proxiedUrl(url))

const toTrack = (url: string, title?: string): LinkTrack => ({ url, title: (title || '').trim() || fileTitle(url), playUrl: playable(url) })

const decodeHtml = (s: string) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()

function fromPage(html: string, base: URL): LinkTrack[] {
  const out = new Map<string, LinkTrack>()
  const add = (href: string, title?: string) => {
    try {
      const abs = new URL(href.replace(/&amp;/g, '&'), base).toString()
      if (!AUDIO_EXT.test(abs) || out.has(abs)) return
      out.set(abs, toTrack(abs, title))
    } catch {}
  }
  // <a href="…mp3">Título</a>
  for (const m of Array.from(html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi))) add(m[1], decodeHtml(m[2]).slice(0, 120))
  // <audio src> / <source src> y cualquier dirección suelta que termine en audio
  for (const m of Array.from(html.matchAll(/\bsrc\s*=\s*["']([^"']+)["']/gi))) add(m[1])
  for (const m of Array.from(html.matchAll(/https?:\/\/[^\s"'<>()]+\.(?:mp3|m4a|aac|ogg|opus|flac|wav)(?:\?[^\s"'<>()]*)?/gi))) add(m[0])
  return Array.from(out.values()).slice(0, 200)
}

function fromPlaylist(text: string, base: URL): LinkTrack[] {
  const out: LinkTrack[] = []
  let title = ''
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const ext = line.match(/^#EXTINF:[^,]*,(.*)$/i)
    if (ext) {
      title = ext[1]
      continue
    }
    const pls = line.match(/^File\d+=(.+)$/i)
    const plsTitle = line.match(/^Title\d+=(.+)$/i)
    if (plsTitle) {
      if (out.length) out[out.length - 1].title = plsTitle[1]
      continue
    }
    const target = pls ? pls[1] : line.startsWith('#') ? '' : line
    if (!target) continue
    try {
      out.push(toTrack(new URL(target, base).toString(), title))
    } catch {}
    title = ''
  }
  return out.slice(0, 200)
}

/** Lee un enlace y devuelve las pistas de audio que contiene */
export async function readAudioLink(raw: string): Promise<LinkTrack[]> {
  let url = await assertPublic(raw.trim())
  if (AUDIO_EXT.test(url.pathname)) return [toTrack(url.toString())]

  // Se siguen las redirecciones a mano para revisar cada destino
  let res: Response | null = null
  for (let i = 0; i < 4; i++) {
    res = await fetch(url, {
      redirect: 'manual',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CarlosPNautoInteractive/1.0)', Accept: 'text/html,audio/*,*/*' },
      signal: AbortSignal.timeout(10000),
      cache: 'no-store',
    })
    const loc = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && loc) {
      url = await assertPublic(new URL(loc, url).toString())
      continue
    }
    break
  }
  if (!res || !res.ok) throw new Error(`La página respondió ${res?.status ?? 'sin respuesta'}`)
  const type = res.headers.get('content-type') || ''
  if (/^audio\//i.test(type) || /octet-stream/i.test(type) && AUDIO_EXT.test(url.pathname)) {
    res.body?.cancel().catch(() => {})
    return [toTrack(url.toString())]
  }

  // Página o lista: se lee como texto (hasta 2 MB)
  const reader = res.body?.getReader()
  let size = 0
  const chunks: Uint8Array[] = []
  while (reader) {
    const { done, value } = await reader.read()
    if (done || !value) break
    chunks.push(value)
    size += value.length
    if (size > MAX_PAGE) {
      reader.cancel().catch(() => {})
      break
    }
  }
  const text = new TextDecoder().decode(Buffer.concat(chunks))
  if (LIST_EXT.test(url.pathname) || /mpegurl|scpls/i.test(type) || /^#EXTM3U|^\[playlist\]/i.test(text.trimStart())) {
    return fromPlaylist(text, url)
  }
  return fromPage(text, url)
}
