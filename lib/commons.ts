// Wikimedia Commons: películas de dominio público o con licencia libre (WebM), gratis y legales.
// Búsqueda con la API de MediaWiki; cada archivo trae su video, una imagen y su ficha.
import type { FreeMovie } from '@/lib/pluto'

const COMMONS = process.env.COMMONS_BASE || 'https://commons.wikimedia.org'
const UA = 'CarlosPNautoInteractive/1.0 (https://peliculas-neon.vercel.app)'

interface Page {
  title: string
  imageinfo?: {
    url?: string
    thumburl?: string
    duration?: number
    mime?: string
    extmetadata?: Record<string, { value?: string }>
  }[]
}

const plain = (html = '') =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** "File:La Balandra Isabel Llegó esta Tarde (1949).webm" → título y año */
function parseTitle(file: string) {
  let t = file.replace(/^File:/, '').trim().replace(/\.(webm|ogv|ogg|mpg|mpeg|mp4)$/i, '')
  const year = t.match(/\((\d{4})[^)]*\)/)?.[1] || t.match(/\b(18[89]\d|19\d\d|20[0-2]\d)\b/)?.[1]
  t = t
    .replace(/\((\d{4})?\s*(film|película|pel[ií]cula)?\)/i, '')
    .replace(/,?\s*-?\s*pel[ií]cula completa/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[\s,-]+$/, '')
    .trim()
  return { title: t, year }
}

/** Versión recodificada de un video de Commons (p. ej. "480p.vp9.webm") */
export function commonsTranscode(url: string, variant: string): string | undefined {
  const m = url.match(/^(https:\/\/upload\.wikimedia\.org\/wikipedia\/commons)\/([0-9a-f]\/[0-9a-f]{2})\/([^/]+)$/)
  return m ? `${m[1]}/transcoded/${m[2]}/${m[3]}/${m[3]}.${variant}` : undefined
}

/** Qué buscar en Commons según la pestaña */
export type CommonsKind = 'es' | 'classic'
const QUERIES: Record<CommonsKind, string> = {
  es: 'filetype:video deepcategory:"Spanish-language films"',
  classic: 'filetype:video "public domain" feature film',
}

/**
 * Películas de Commons. Solo largometrajes y medios (más de 20 minutos), para no mezclar
 * cortos, noticieros ni avances.
 */
export async function searchCommonsMovies(kind: CommonsKind, q = '', page = 1): Promise<FreeMovie[]> {
  const clean = q.replace(/["():*?\[\]{}^~!\\/]/g, ' ').trim()
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: clean ? `${QUERIES[kind]} ${clean}` : QUERIES[kind],
    gsrnamespace: '6',
    gsrlimit: '50',
    gsroffset: String((page - 1) * 50),
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: '480',
    iiextmetadatafilter: 'ObjectName|ImageDescription|DateTimeOriginal|LicenseShortName|Artist',
    format: 'json',
    formatversion: '2',
    origin: '*',
  })
  const res = await fetch(`${COMMONS}/w/api.php?${params}`, {
    headers: { 'User-Agent': UA },
    next: { revalidate: 86400 },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`Commons ${res.status}`)
  const data = (await res.json()) as { query?: { pages?: Page[] | Record<string, Page> } }
  const pages = data.query?.pages ? (Array.isArray(data.query.pages) ? data.query.pages : Object.values(data.query.pages)) : []
  const seen = new Set<string>()
  return pages
    .map((p) => {
      const ii = p.imageinfo?.[0]
      if (!ii?.url || !(ii.duration && ii.duration >= 20 * 60)) return null
      // Commons agrega parámetros de seguimiento a la dirección: se quitan
      const url = ii.url.split('?')[0]
      const meta = ii.extmetadata ?? {}
      const parsed = parseTitle(p.title)
      const named = plain(meta.ObjectName?.value)
      const title = (named.length < 90 && parseTitle(named).title) || parsed.title
      // Fuera los que tienen nombre de archivo en vez de título ("15M-ExcelenteRevulsivo…H264")
      if (!/\s/.test(title) && title.length > 18) return null
      if (/\b(h264|x264|1080p|720p|v\d\.\d)\b/i.test(title)) return null
      // La misma película subida dos veces (misma duración y mismo comienzo del título)
      const dup = `${Math.round(ii.duration / 60)}|${title.toLowerCase().slice(0, 8)}`
      if (seen.has(dup)) return null
      seen.add(dup)
      const year = parsed.year || plain(meta.DateTimeOriginal?.value).match(/\b(18|19|20)\d\d\b/)?.[0]
      const movie: FreeMovie = {
        id: `commons-${p.title.replace(/^File:/, '')}`,
        title,
        poster: (ii.thumburl || '').split('?')[0],
        summary: plain(meta.ImageDescription?.value).slice(0, 600),
        year,
        duration: Math.round(ii.duration / 60),
        genre: /public domain/i.test(plain(meta.LicenseShortName?.value)) ? 'Dominio público' : plain(meta.LicenseShortName?.value) || undefined,
        url,
        // Respaldo: la versión de 480p que Commons prepara (más liviana)
        fallbackUrl: commonsTranscode(url, '480p.vp9.webm'),
        source: 'commons',
        spanish: kind === 'es',
        landscape: true,
      }
      return movie
    })
    .filter((m): m is FreeMovie => !!m)
}
