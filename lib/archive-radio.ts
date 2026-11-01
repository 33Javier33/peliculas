// Radio de Internet Archive por género: una radio que no se detiene, hecha solo con música de
// archive.org. Cada pedido elige al azar varios discos del género (entre los más escuchados) y
// toma algunas canciones de cada uno; el reproductor pide más antes de que se acaben.
import { readArchive, type LinkAlbum } from '@/lib/audio-link'

const ARCHIVE = process.env.ARCHIVE_BASE || 'https://archive.org'

export interface RadioGenre {
  id: string
  label: string
  /** Emoji de la tarjeta */
  icon: string
  /** Colores de la tarjeta (Tailwind) */
  color: string
  terms: string
}

export const RADIO_GENRES: RadioGenre[] = [
  { id: 'latina', label: 'Latina', icon: '💃', color: 'from-rose-500 to-orange-500', terms: 'subject:(latin OR latina OR latino OR salsa OR cumbia OR bolero OR tango OR merengue OR bachata OR mambo OR "son cubano" OR ranchera OR "música latina" OR "musica latina")' },
  { id: 'rock', label: 'Rock', icon: '🎸', color: 'from-red-600 to-rose-700', terms: 'subject:(rock OR "rock and roll" OR "classic rock" OR "indie rock" OR punk)' },
  { id: 'pop', label: 'Pop', icon: '🎤', color: 'from-pink-500 to-fuchsia-600', terms: 'subject:(pop OR "pop music" OR synthpop OR "indie pop")' },
  { id: 'electronica', label: 'Electrónica', icon: '🎛️', color: 'from-cyan-500 to-blue-600', terms: 'subject:(electronic OR electronica OR techno OR house OR trance OR idm OR edm OR "drum and bass")' },
  { id: 'jazz', label: 'Jazz', icon: '🎷', color: 'from-amber-500 to-yellow-600', terms: 'subject:(jazz OR swing OR bebop OR "big band")' },
  { id: 'blues', label: 'Blues', icon: '🎺', color: 'from-blue-700 to-indigo-700', terms: 'subject:(blues)' },
  { id: 'clasica', label: 'Clásica', icon: '🎻', color: 'from-stone-500 to-amber-700', terms: 'subject:(classical OR "classical music" OR symphony OR baroque OR opera OR piano) OR collection:(musopen)' },
  { id: 'hiphop', label: 'Hip hop', icon: '🎧', color: 'from-violet-600 to-purple-800', terms: 'subject:(hip-hop OR hiphop OR "hip hop" OR rap)' },
  { id: 'reggae', label: 'Reggae y ska', icon: '🌴', color: 'from-green-600 to-yellow-500', terms: 'subject:(reggae OR dub OR ska OR dancehall)' },
  { id: 'folk', label: 'Folk y country', icon: '🪕', color: 'from-orange-700 to-amber-800', terms: 'subject:(folk OR acoustic OR country OR bluegrass OR "singer-songwriter")' },
  { id: 'metal', label: 'Metal', icon: '🤘', color: 'from-zinc-600 to-zinc-900', terms: 'subject:(metal OR "heavy metal" OR "death metal" OR "black metal" OR thrash)' },
  { id: 'ambient', label: 'Relajo', icon: '🌙', color: 'from-indigo-500 to-sky-700', terms: 'subject:(ambient OR chillout OR lounge OR downtempo OR relax)' },
  { id: 'antiguos', label: 'Discos de 78 rpm', icon: '📻', color: 'from-yellow-700 to-stone-700', terms: 'collection:(78rpm)' },
  { id: 'envivo', label: 'Conciertos en vivo', icon: '🏟️', color: 'from-emerald-600 to-teal-700', terms: 'collection:(etree)' },
]

/**
 * Solo colecciones con música que se puede compartir: sellos independientes con licencia libre
 * (netlabels, Jamendo, Free Music Archive), discos antiguos digitalizados (78 rpm) y Musopen. Las
 * subidas sueltas de usuarios quedan fuera (ahí hay mucha música comercial copiada).
 */
const LEGAL = 'collection:(netlabels OR 78rpm OR musopen OR jamendo-albums OR freemusicarchive OR fma_full)'
const ADULT = '(porn OR porno OR sex OR sexo OR xxx OR erotic OR hentai OR gore OR goregrind OR pornogrind OR "harsh noise")'
const MUSIC_ONLY = `mediatype:(audio) AND ${LEGAL} AND NOT collection:(no-preview OR podcasts OR podcasts_compilations) AND NOT subject:${ADULT} AND NOT title:${ADULT}`
/** Conciertos del Live Music Archive (bandas que permiten grabar y compartir sus shows) */
const LIVE = `mediatype:(etree) AND collection:(etree) AND NOT title:${ADULT}`

const pick = <T,>(list: T[], n: number) => {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a.slice(0, n)
}

/**
 * De dónde sale la música de cada radio. Además de los sellos independientes, cada género toma
 * artistas conocidos de colecciones legítimas: discos originales de 78 rpm (Bill Haley, Elvis,
 * Pedro Infante, Duke Ellington…) y conciertos del Live Music Archive (Grateful Dead, Smashing
 * Pumpkins…). El peso dice cuántas veces más se elige cada fuente.
 */
const R78 = `mediatype:(audio) AND collection:(78rpm) AND NOT title:${ADULT}`
const ROCK_ROLL_ARTISTS =
  'creator:("Elvis Presley" OR "Chuck Berry" OR "Bill Haley" OR "Buddy Holly" OR "Little Richard" OR "Fats Domino" OR "Jerry Lee Lewis" OR "Everly Brothers" OR "Carl Perkins" OR "Johnny Cash" OR "Ritchie Valens" OR "Eddie Cochran" OR "Gene Vincent" OR "Bo Diddley" OR "The Platters" OR "Ray Charles")'
const SOURCES: Record<string, { q: string; weight: number }[]> = {
  rock: [
    { q: `${R78} AND (${ROCK_ROLL_ARTISTS} OR subject:("rock and roll" OR "rock & roll" OR "rock 'n' roll" OR "rock n roll" OR rockabilly))`, weight: 3 },
    { q: LIVE, weight: 3 },
    { q: `${MUSIC_ONLY} AND subject:(rock OR "rock and roll" OR "classic rock" OR "indie rock" OR punk)`, weight: 1 },
  ],
  latina: [
    { q: `${R78} AND subject:(latin OR latina OR bolero OR tango OR rumba OR mambo OR ranchera OR guaracha OR cha-cha OR merengue OR cumbia OR "son cubano")`, weight: 3 },
    { q: `${MUSIC_ONLY} AND subject:(latin OR latina OR latino OR salsa OR cumbia OR bolero OR tango OR merengue OR bachata OR reggaeton OR "música latina")`, weight: 1 },
  ],
  jazz: [
    { q: `${R78} AND subject:(jazz OR swing OR bebop OR "big band")`, weight: 3 },
    { q: `${MUSIC_ONLY} AND subject:(jazz OR swing OR bebop OR "big band")`, weight: 1 },
  ],
  blues: [
    { q: `${R78} AND subject:(blues OR "rhythm and blues")`, weight: 3 },
    { q: `${MUSIC_ONLY} AND subject:(blues)`, weight: 1 },
  ],
  folk: [
    { q: `${R78} AND subject:(country OR hillbilly OR western OR folk OR bluegrass)`, weight: 2 },
    { q: `${MUSIC_ONLY} AND subject:(folk OR acoustic OR country OR bluegrass OR "singer-songwriter")`, weight: 1 },
  ],
  pop: [
    { q: `${R78} AND subject:(pop OR vocal OR "popular music" OR crooner OR "doo-wop")`, weight: 1 },
    { q: `${MUSIC_ONLY} AND subject:(pop OR "pop music" OR synthpop OR "indie pop")`, weight: 2 },
  ],
}
const sourcesOf = (g: RadioGenre) => SOURCES[g.id] ?? [{ q: g.id === 'envivo' ? LIVE : `${MUSIC_ONLY} AND (${g.terms})`, weight: 1 }]

interface PoolItem {
  id: string
  creator: string
}
// Discos de cada fuente (se guardan un rato: no hace falta buscarlos en cada pedido)
const pools = new Map<string, { at: number; items: PoolItem[] }>()

async function sourcePool(key: string, q: string): Promise<PoolItem[]> {
  const hit = pools.get(key)
  if (hit && Date.now() - hit.at < 6 * 60 * 60 * 1000 && hit.items.length) return hit.items
  // Dos páginas al azar entre los 600 discos más escuchados (conocidos, con variedad)
  const pages = pick([1, 2, 3, 4, 5, 6], 2)
  const lists = await Promise.all(
    pages.map(async (page) => {
      const params = new URLSearchParams({ q, rows: '100', page: String(page), output: 'json' })
      params.append('fl[]', 'identifier')
      params.append('fl[]', 'creator')
      params.append('sort[]', 'downloads desc')
      const res = await fetch(`${ARCHIVE}/advancedsearch.php?${params}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CarlosPNautoInteractive/1.0)' },
        signal: AbortSignal.timeout(12000),
        cache: 'no-store',
      }).catch(() => null)
      if (!res?.ok) return []
      const d = (await res.json()) as { response?: { docs?: { identifier: string; creator?: string | string[] }[] } }
      return (d.response?.docs ?? [])
        .filter((x) => x.identifier)
        .map((x) => ({ id: x.identifier, creator: String((Array.isArray(x.creator) ? x.creator[0] : x.creator) || x.identifier).toLowerCase() }))
    })
  )
  const seen = new Set<string>()
  const items = lists.flat().filter((x) => !seen.has(x.id) && seen.add(x.id))
  if (items.length) pools.set(key, { at: Date.now(), items })
  return items
}

/** Discos para la próxima tanda: según el peso de cada fuente y sin repetir artista */
async function nextItems(g: RadioGenre, used: Set<string>, n: number, artists: Set<string>): Promise<string[]> {
  const sources = sourcesOf(g)
  const lists = await Promise.all(
    sources.map(async (src, i) => {
      const key = `${g.id}:${i}`
      let items = (await sourcePool(key, src.q)).filter((x) => !used.has(x.id))
      if (items.length < 4) {
        // Se recorrió todo lo guardado de esta fuente: otra tanda
        pools.delete(key)
        items = (await sourcePool(key, src.q)).filter((x) => !used.has(x.id))
      }
      return pick(items, items.length)
    })
  )
  const out: string[] = []
  const total = sources.reduce((a, s) => a + s.weight, 0)
  for (let tries = 0; out.length < n && tries < n * 12; tries++) {
    // Fuente al azar según su peso
    let r = Math.random() * total
    let i = 0
    while (i < sources.length - 1 && (r -= sources[i].weight) > 0) i++
    const list = lists[i].length ? lists[i] : lists.find((l) => l.length)
    if (!list) break
    const item = list.shift()!
    // Un disco por artista en cada tanda (si no, Grateful Dead llenaría la radio de rock)
    const who = item.creator.replace(/\s+(and|y|with|con)\s+.*$/, '').replace(/[^a-z0-9]+/g, ' ').trim()
    if (artists.has(who) || out.includes(item.id)) continue
    artists.add(who)
    out.push(item.id)
  }
  return out
}

/**
 * Próximas canciones de la radio de un género: canciones de varios discos distintos, mezcladas.
 * Se saltan los discos ya usados (skip) para no repetir.
 */
export async function radioBatch(genreId: string, skip: string[] = [], want = 12): Promise<LinkAlbum[]> {
  const g = RADIO_GENRES.find((x) => x.id === genreId)
  if (!g) throw new Error('Género desconocido')
  const used = new Set(skip)
  const albums: LinkAlbum[] = []
  let count = 0
  const artists = new Set<string>()
  // De a 4 discos a la vez, hasta juntar las canciones pedidas (máximo 3 rondas)
  for (let round = 0; round < 3 && count < want; round++) {
    const batch = await nextItems(g, used, 4, artists)
    if (!batch.length) break
    batch.forEach((id) => used.add(id))
    const read = await Promise.all(
      batch.map((id) =>
        readArchive(id, `https://archive.org/details/${encodeURIComponent(id)}`)
          .then((list) => ({ id, list }))
          .catch(() => ({ id, list: [] as LinkAlbum[] }))
      )
    )
    for (const { id, list } of read) {
      // Canciones de largo normal (ni cortinas ni conciertos enteros en un solo archivo)
      const songs = list.flatMap((a) => a.tracks.map((t) => ({ a, t }))).filter(({ t }) => !t.duration || (t.duration >= 60 && t.duration <= 15 * 60))
      if (!songs.length) continue
      // La misma canción en varias versiones (78 rpm: original, restaurada…): una sola
      const seenTitle = new Set<string>()
      for (let k = songs.length - 1; k >= 0; k--) {
        const key = (songs[k].t.title || '').toLowerCase().replace(/[^a-z0-9áéíóúñ]+/g, ' ').replace(/\b(restored|restaurad[oa]|version|take \d+)\b/g, '').trim()
        if (seenTitle.has(key)) songs.splice(k, 1)
        else seenTitle.add(key)
      }
      // 2 o 3 canciones por disco: así la radio va cambiando de artista
      const chosen = pick(songs, Math.min(songs.length, g.id === 'antiguos' ? 2 : 3))
      const byAlbum = new Map<LinkAlbum, LinkAlbum['tracks']>()
      for (const { a, t } of chosen) byAlbum.set(a, [...(byAlbum.get(a) ?? []), t])
      for (const [a, tracks] of Array.from(byAlbum.entries())) albums.push({ ...a, source: a.source || `https://archive.org/details/${encodeURIComponent(id)}`, tracks })
      count += chosen.length
    }
  }
  return albums
}
