// Compartir canciones y playlists con un enlace. Las canciones de YouTube usan /play/ID; las de
// discos y enlaces (archive.org, MP3) y las playlists van completas dentro del enlace (después
// del #, comprimidas), así funcionan sin guardar nada en el servidor.
import type { MusicVideo } from '@/lib/youtube-music'
import { hash } from '@/lib/link-albums'

const YT_ID = /^[A-Za-z0-9_-]{11}$/

interface Packed {
  y?: string // YouTube
  u?: string // audio (https)
  t: string
  a?: string
  c?: string // carátula
  l?: string // disco
  d?: string // duración
}

function pack(t: MusicVideo): Packed | null {
  const name = t.title
  if (YT_ID.test(t.id) && !t.audioUrl) return { y: t.id, t: name, a: t.channelTitle || undefined, d: t.duration }
  const url = [t.audioUrl, t.description].find((u) => u?.startsWith('https://'))
  if (!url) return null
  return {
    u: url,
    t: name,
    a: t.channelTitle || undefined,
    c: t.thumbnail?.startsWith('https://') ? t.thumbnail : undefined,
    l: t.album,
    d: t.duration,
  }
}

function unpack(p: Packed): MusicVideo | null {
  if (p.y && YT_ID.test(p.y))
    return { id: p.y, title: p.t, channelTitle: p.a || '', thumbnail: `https://i.ytimg.com/vi/${p.y}/hqdefault.jpg`, publishedAt: '', description: '', duration: p.d }
  if (!p.u?.startsWith('https://')) return null
  return {
    id: `link-${hash(p.u)}`,
    title: p.t,
    channelTitle: p.a || '',
    thumbnail: p.c?.startsWith('https://') ? p.c : '/icons/icon-512.png',
    publishedAt: '',
    description: p.u,
    album: p.l,
    duration: p.d,
    audioUrl: p.u,
  }
}

const toB64 = (bytes: Uint8Array) => {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const fromB64 = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream))
  return new Uint8Array(await out.arrayBuffer())
}

/** Datos → texto corto para el enlace ("z" = comprimido, "j" = sin comprimir) */
async function encode(data: unknown): Promise<string> {
  const raw = new TextEncoder().encode(JSON.stringify(data))
  if (typeof CompressionStream !== 'undefined') {
    try {
      return `z${toB64(await pipe(raw, new CompressionStream('deflate-raw')))}`
    } catch {}
  }
  return `j${toB64(raw)}`
}

async function decode<T>(s: string): Promise<T | null> {
  try {
    const bytes = fromB64(s.slice(1))
    const raw = s[0] === 'z' ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes
    return JSON.parse(new TextDecoder().decode(raw)) as T
  } catch {
    return null
  }
}

/** Enlace para compartir una canción */
export async function trackShareUrl(t: MusicVideo): Promise<string> {
  const origin = window.location.origin
  if (YT_ID.test(t.id) && !t.audioUrl) return `${origin}/play/${t.id}`
  const p = pack(t)
  return p ? `${origin}/escuchar#${await encode(p)}` : `${origin}/music`
}

/** Canción de un enlace /escuchar#… */
export async function readSharedTrack(code: string): Promise<MusicVideo | null> {
  const p = await decode<Packed>(code)
  return p ? unpack(p) : null
}

/** Enlace para compartir una playlist completa */
export async function playlistShareUrl(name: string, tracks: MusicVideo[]): Promise<string> {
  const k = tracks.map(pack).filter((p): p is Packed => !!p)
  return `${window.location.origin}/music/playlist/compartida#${await encode({ n: name, k })}`
}

/** Playlist de un enlace /music/playlist/compartida#… */
export async function readSharedPlaylist(code: string): Promise<{ name: string; tracks: MusicVideo[] } | null> {
  const d = await decode<{ n?: string; k?: Packed[] }>(code)
  if (!d?.k) return null
  return { name: (d.n || 'Playlist compartida').slice(0, 60), tracks: d.k.map(unpack).filter((t): t is MusicVideo => !!t) }
}

/** Abre el menú de compartir del teléfono (o copia el enlace) */
export async function shareLink(title: string, text: string, url: string): Promise<'shared' | 'copied' | 'none'> {
  try {
    if (navigator.share) {
      await navigator.share({ title, text, url })
      return 'shared'
    }
    await navigator.clipboard.writeText(`${text}\n${url}`)
    return 'copied'
  } catch {
    return 'none'
  }
}
