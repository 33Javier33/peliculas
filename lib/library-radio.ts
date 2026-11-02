// Radio de Internet Archive + tu biblioteca: entre las canciones de archive.org se suman canciones
// que guardaste (♥ de YouTube y discos de archive.org/enlaces) del mismo género. El género de cada
// artista se consulta en MusicBrainz una sola vez y queda guardado en el teléfono.
import type { MusicVideo } from '@/lib/youtube-music'
import { useMusicStore, parseTrackMeta } from '@/store/musicStore'
import { useLinksStore } from '@/store/linksStore'
import { useOfflineStore } from '@/store/offlineStore'

const KEY = 'cpn-artist-genres'
type GenreCache = Record<string, { g: string[]; at: number }>

/** Palabras de los géneros de MusicBrainz que corresponden a cada radio */
const MATCH: Record<string, RegExp> = {
  rock: /rock|punk|grunge|alternativ|new wave|post-punk|garage|psychedelic|britpop|shoegaze/,
  pop: /\bpop\b|synthpop|dance-pop|teen pop|europop|electropop/,
  latina: /latin|salsa|cumbia|bolero|tango|reggaeton|bachata|merengue|ranchera|mariachi|cuban|mexican|trova|son\b|vallenato|nueva canci|tropical|regional mexican|rock en espa/,
  electronica: /electro|electr[oó]nic|techno|house|trance|edm|\bdance\b|idm|drum and bass|dubstep|synthwave|breakbeat/,
  jazz: /jazz|swing|bebop|big band|bossa/,
  blues: /blues|rhythm and blues|r&b|soul|funk/,
  clasica: /classical|cl[aá]sica|baroque|opera|symphon|romantic|orchestral|chamber/,
  hiphop: /hip hop|hip-hop|rap|trap|grime/,
  reggae: /reggae|ska|\bdub\b|dancehall|rocksteady/,
  folk: /folk|cantautor|country|bluegrass|americana|singer-songwriter|singer\/songwriter|acoustic/,
  metal: /metal|thrash|hardcore/,
  ambient: /ambient|chill|downtempo|lounge|new age|trip hop/,
}

function readCache(): GenreCache {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') as GenreCache
  } catch {
    return {}
  }
}
function writeCache(c: GenreCache) {
  try {
    localStorage.setItem(KEY, JSON.stringify(c))
  } catch {}
  // Las listas que muestran el género se actualizan solas
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('cpn-genres'))
}

/** Nombre de cada género (las mismas radios de Internet Archive) */
export const GENRE_LABELS: Record<string, string> = {
  latina: 'Latina',
  rock: 'Rock',
  pop: 'Pop',
  electronica: 'Electrónica',
  jazz: 'Jazz',
  blues: 'Blues y soul',
  clasica: 'Clásica',
  hiphop: 'Hip hop',
  reggae: 'Reggae y ska',
  folk: 'Folk y country',
  metal: 'Metal',
  ambient: 'Relajo',
}

/** Género principal de un artista (según su etiqueta más votada en MusicBrainz), si ya se conoce */
export function genreOfArtist(artist: string, cache: GenreCache = readCache()): string | null {
  const tags = cache[artist.trim().toLowerCase()]?.g
  if (!tags?.length) return null
  for (const tag of tags) for (const [id, re] of Object.entries(MATCH)) if (re.test(tag)) return id
  return null
}
export const genreCacheSnapshot = readCache

/** Artista principal de un crédito ("Johnny Cash, Tennessee Two" → "Johnny Cash") */
export const mainArtistName = (a: string) =>
  a
    .replace(/\s*-\s*topic$/i, '')
    .replace(/vevo$/i, '')
    .split(/;|,|\s&\s|\s+(?:feat\.?|ft\.?|x)\s+/i)[0]
    .trim()

/** Artista principal de una canción ("Soda Stereo - Topic", "Johnny Cash, Tennessee Two" → nombre) */
export function songArtist(t: MusicVideo): string {
  const a = (t as { artist?: string }).artist || parseTrackMeta(t).artist || t.channelTitle || ''
  return mainArtistName(a)
}

/** Canciones de la biblioteca: ♥, discos guardados (archive.org y enlaces) y todo lo descargado */
export function librarySongs(): MusicVideo[] {
  const { saved } = useMusicStore.getState()
  const links = useLinksStore.getState().tracks
  const downloaded = Object.values(useOfflineStore.getState().items).map((i) => i.track)
  const all = [...saved, ...links, ...downloaded].filter((t) => !t.streamUrl)
  const seen = new Set<string>()
  return all.filter((t) => !seen.has(t.id) && seen.add(t.id))
}

let classifying = false
const queue: string[] = []

/**
 * Averigua (de a poco y en segundo plano) los géneros de estos artistas. MusicBrainz permite una
 * consulta por segundo: se espera entre una y otra. Lo ya conocido no se vuelve a consultar.
 */
export async function classifyArtists(names: string[], max = 60) {
  if (typeof window === 'undefined') return
  const cache = readCache()
  // Artista sin género conocido: se vuelve a preguntar a los 3 días (antes, al mes)
  const retryAfter = 3 * 86400000
  for (const n of names) {
    const name = n.trim()
    const c = cache[name.toLowerCase()]
    if (!name || queue.includes(name) || (c && (c.g.length > 0 || Date.now() - c.at < retryAfter))) continue
    if (queue.length < max) queue.push(name)
  }
  if (classifying) return
  classifying = true
  try {
    while (queue.length) {
      const name = queue[0]
      const r = await fetch(`/api/artist-genres?name=${encodeURIComponent(name)}`).catch(() => null)
      if (r?.ok) {
        const d = (await r.json()) as { genres?: string[] }
        const cache = readCache()
        cache[name.toLowerCase()] = { g: (d.genres ?? []).map((x) => x.toLowerCase()), at: Date.now() }
        writeCache(cache)
      }
      queue.shift()
      await new Promise((res) => setTimeout(res, 1200))
    }
  } finally {
    classifying = false
  }
}

/** Géneros de todos los artistas de tu biblioteca (♥, discos guardados y descargas) */
export function classifyLibrary(max = 60) {
  return classifyArtists(Array.from(new Set(librarySongs().map(songArtist).filter(Boolean))), max)
}

// Canciones de la biblioteca que ya sonaron en esta radio (no se repiten hasta agotar las demás)
const used = new Map<string, Set<string>>()

/** Hasta n canciones de tu biblioteca del género de la radio (que no estén ya en la cola) */
export function librarySongsFor(genre: string, n: number, inQueue: Set<string>): MusicVideo[] {
  const re = MATCH[genre]
  if (!re) return []
  const cache = readCache()
  const matching = librarySongs().filter((t) => {
    const g = cache[songArtist(t).toLowerCase()]?.g
    return !!g?.some((x) => re.test(x)) && !inQueue.has(t.id)
  })
  if (!matching.length) return []
  let done = used.get(genre) ?? new Set<string>()
  let fresh = matching.filter((t) => !done.has(t.id))
  if (!fresh.length) {
    done = new Set()
    fresh = matching
  }
  const chosen: MusicVideo[] = []
  const artists = new Set<string>()
  for (const t of fresh.sort(() => Math.random() - 0.5)) {
    const a = songArtist(t).toLowerCase()
    if (artists.has(a)) continue
    artists.add(a)
    chosen.push(t)
    if (chosen.length >= n) break
  }
  chosen.forEach((t) => done.add(t.id))
  used.set(genre, done)
  return chosen
}
