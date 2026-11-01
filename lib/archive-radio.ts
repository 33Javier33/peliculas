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

// Lista de discos por género (se guarda un rato: no hace falta buscarla en cada pedido)
const pools = new Map<string, { at: number; ids: string[] }>()

async function genrePool(g: RadioGenre): Promise<string[]> {
  const hit = pools.get(g.id)
  if (hit && Date.now() - hit.at < 6 * 60 * 60 * 1000 && hit.ids.length) return hit.ids
  // Dos páginas al azar entre los 1.000 discos más escuchados del género (variedad sin rarezas)
  const pages = pick([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 2)
  const lists = await Promise.all(
    pages.map(async (page) => {
      const params = new URLSearchParams({ q: g.id === 'envivo' ? LIVE : `${MUSIC_ONLY} AND (${g.terms})`, rows: '100', page: String(page), output: 'json' })
      params.append('fl[]', 'identifier')
      params.append('sort[]', 'downloads desc')
      const res = await fetch(`${ARCHIVE}/advancedsearch.php?${params}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CarlosPNautoInteractive/1.0)' },
        signal: AbortSignal.timeout(12000),
        cache: 'no-store',
      })
      if (!res.ok) return []
      const d = (await res.json()) as { response?: { docs?: { identifier: string }[] } }
      return (d.response?.docs ?? []).map((x) => x.identifier).filter(Boolean)
    })
  )
  const ids = Array.from(new Set(lists.flat()))
  if (ids.length) pools.set(g.id, { at: Date.now(), ids })
  return ids
}

/**
 * Próximas canciones de la radio de un género: canciones de varios discos distintos, mezcladas.
 * Se saltan los discos ya usados (skip) para no repetir.
 */
export async function radioBatch(genreId: string, skip: string[] = [], want = 12): Promise<LinkAlbum[]> {
  const g = RADIO_GENRES.find((x) => x.id === genreId)
  if (!g) throw new Error('Género desconocido')
  const used = new Set(skip)
  let pool = (await genrePool(g)).filter((id) => !used.has(id))
  if (pool.length < 4) {
    // Se recorrió todo lo guardado: otra tanda de discos
    pools.delete(g.id)
    pool = (await genrePool(g)).filter((id) => !used.has(id))
  }
  const albums: LinkAlbum[] = []
  let count = 0
  // De a 4 discos a la vez, hasta juntar las canciones pedidas (máximo 3 rondas)
  for (let round = 0; round < 3 && count < want && pool.length; round++) {
    const batch = pick(pool, 4)
    pool = pool.filter((id) => !batch.includes(id))
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
