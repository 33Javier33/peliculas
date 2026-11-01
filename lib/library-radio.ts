// Radio de Internet Archive + tu biblioteca: entre las canciones de archive.org se suman canciones
// que guardaste (♥ de YouTube y discos de archive.org/enlaces) del mismo género. El género de cada
// artista se consulta en MusicBrainz una sola vez y queda guardado en el teléfono.
import type { MusicVideo } from '@/lib/youtube-music'
import { useMusicStore, parseTrackMeta } from '@/store/musicStore'
import { useLinksStore } from '@/store/linksStore'

const KEY = 'cpn-artist-genres'
type GenreCache = Record<string, { g: string[]; at: number }>

/** Palabras de los géneros de MusicBrainz que corresponden a cada radio */
const MATCH: Record<string, RegExp> = {
  rock: /rock|punk|grunge|alternative|new wave|post-punk|garage|psychedelic|britpop|shoegaze/,
  pop: /\bpop\b|synthpop|dance-pop|teen pop|europop|electropop/,
  latina: /latin|salsa|cumbia|bolero|tango|reggaeton|bachata|merengue|ranchera|mariachi|cuban|mexican|trova|son\b|vallenato|nueva canci|tropical|regional mexican|rock en espa/,
  electronica: /electro|techno|house|trance|edm|\bdance\b|idm|drum and bass|dubstep|synthwave|breakbeat/,
  jazz: /jazz|swing|bebop|big band|bossa/,
  blues: /blues|rhythm and blues|r&b|soul|funk/,
  clasica: /classical|baroque|opera|symphon|romantic|orchestral|chamber/,
  hiphop: /hip hop|hip-hop|rap|trap|grime/,
  reggae: /reggae|ska|\bdub\b|dancehall|rocksteady/,
  folk: /folk|country|bluegrass|americana|singer-songwriter|acoustic/,
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
}

/** Artista principal de una canción ("Soda Stereo - Topic", "Johnny Cash, Tennessee Two" → nombre) */
export function songArtist(t: MusicVideo): string {
  const a = (t as { artist?: string }).artist || parseTrackMeta(t).artist || t.channelTitle || ''
  return a
    .replace(/\s*-\s*topic$/i, '')
    .replace(/vevo$/i, '')
    .split(/;|,|\s&\s|\s+(?:feat\.?|ft\.?|x)\s+/i)[0]
    .trim()
}

/** Canciones guardadas en la biblioteca (♥ y discos guardados), sin radios en vivo */
function librarySongs(): MusicVideo[] {
  const { saved } = useMusicStore.getState()
  const links = useLinksStore.getState().tracks
  const all = [...saved, ...links].filter((t) => !t.streamUrl)
  const seen = new Set<string>()
  return all.filter((t) => !seen.has(t.id) && seen.add(t.id))
}

let classifying = false
/**
 * Averigua (de a poco y en segundo plano) los géneros de los artistas de tu biblioteca que aún no
 * se conocen. MusicBrainz permite una consulta por segundo: se espera entre una y otra.
 */
export async function classifyLibrary(max = 6) {
  if (classifying || typeof window === 'undefined') return
  classifying = true
  try {
    const cache = readCache()
    const month = 30 * 86400000
    const pending = Array.from(new Set(librarySongs().map(songArtist).filter(Boolean)))
      .filter((a) => !cache[a.toLowerCase()] || (cache[a.toLowerCase()].g.length === 0 && Date.now() - cache[a.toLowerCase()].at > month))
      .slice(0, max)
    for (const name of pending) {
      const r = await fetch(`/api/artist-genres?name=${encodeURIComponent(name)}`).catch(() => null)
      if (r?.ok) {
        const d = (await r.json()) as { genres?: string[] }
        cache[name.toLowerCase()] = { g: (d.genres ?? []).map((x) => x.toLowerCase()), at: Date.now() }
        writeCache(cache)
      }
      await new Promise((res) => setTimeout(res, 1200))
    }
  } finally {
    classifying = false
  }
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
