// Enlaces cortos para compartir canciones de archive.org: /a/DISCO/CÓDIGO. El código sale del
// nombre del archivo de la canción (sin extensión), así sirve para todos sus formatos (MP3, FLAC…).
import { hash } from '@/lib/link-albums'

/** Disco y nombre de la canción de una dirección de archive.org (/download/ID/archivo) */
export function archiveParts(url?: string): { id: string; file: string } | null {
  if (!url) return null
  // (también el servidor de pruebas de archive.org, si está configurado)
  const test = typeof process !== 'undefined' ? process.env.ARCHIVE_BASE : undefined
  const m =
    url.match(/^https:\/\/(?:[a-z0-9-]+\.)*archive\.org\/download\/([^/?#]+)\/([^?#]+)/i) ||
    (test && url.startsWith(`${test}/download/`) ? url.slice(test.length).match(/^\/download\/([^/?#]+)\/([^?#]+)/) : null)
  if (!m) return null
  try {
    return { id: decodeURIComponent(m[1]), file: m[2].split('/').map(decodeURIComponent).join('/') }
  } catch {
    return null
  }
}

/** Código corto de una canción (igual para «01 Tema.flac», «01 Tema.mp3» o «01 Tema_vbr.mp3») */
export function songCode(file: string): string {
  const base = (file.split('/').pop() || file)
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/_(vbr|64kb|128kb|256kb|320kb)$/i, '')
    .toLowerCase()
    .trim()
  return hash(base)
}

/** /a/DISCO/CÓDIGO de una canción de archive.org (o null si no es de archive.org) */
export function shortArchivePath(t: { audioUrl?: string; description?: string }): string | null {
  const p = archiveParts(t.description) || archiveParts(t.audioUrl)
  return p ? `/a/${encodeURIComponent(p.id)}/${songCode(p.file)}` : null
}
