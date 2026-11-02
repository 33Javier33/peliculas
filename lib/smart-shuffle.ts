import type { MusicVideo } from '@/lib/youtube-music'

// Aleatorio de verdad repartido: suenan TODAS las canciones (una vez cada una), pero un mismo
// artista, y dentro de él un mismo disco, quedan repartidos a lo largo de toda la lista. Con el
// azar simple, si dos discos completos son buena parte de la biblioteca, sus canciones salían
// seguidas y parecía que no era aleatorio (es lo mismo que corrigió Spotify en su aleatorio).

const clean = (s: string) =>
  s
    .toLowerCase()
    .replace(/\s*-\s*topic$/, '')
    .replace(/vevo$/, '')
    .split(/;|,|\s&\s|\s+(?:feat\.?|ft\.?)\s+/)[0]
    .trim()

export function artistKey(t: MusicVideo): string {
  const a = (t as { artist?: string }).artist || (/ [-–—] /.test(t.title) ? t.title.split(/ [-–—] /)[0] : '') || t.channelTitle || ''
  return clean(a) || t.id
}

export function albumKey(t: MusicVideo): string {
  const item = (t.audioUrl || t.description || '').match(/\/download\/([^/?#]+)/)?.[1]
  return (t.album || item || '').toLowerCase().trim()
}

export function fisherYates<T>(list: T[]): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Reparte los elementos de cada grupo a distancias parejas (con un punto de partida al azar) */
function spread<T>(list: T[], key: (t: T) => string, inner?: (group: T[]) => T[]): T[] {
  const groups = new Map<string, T[]>()
  for (const t of list) {
    const k = key(t)
    const g = groups.get(k)
    if (g) g.push(t)
    else groups.set(k, [t])
  }
  const placed: { t: T; pos: number }[] = []
  for (const g of Array.from(groups.values())) {
    const ordered = inner ? inner(g) : fisherYates(g)
    const n = ordered.length
    const offset = Math.random() / n
    ordered.forEach((t, i) => {
      // Posición pareja dentro de la lista, con un poco de azar para que no sea un patrón fijo
      const jitter = ((Math.random() - 0.5) * 0.2) / n
      placed.push({ t, pos: offset + i / n + jitter })
    })
  }
  return placed.sort((a, b) => a.pos - b.pos).map((p) => p.t)
}

/**
 * Segunda pasada: si quedan dos canciones seguidas del mismo artista, se cambia la segunda por
 * una más adelante que no choque con sus vecinas (cuando un artista es más de la mitad de la
 * lista, algunas quedan seguidas igual: no hay con qué separarlas).
 */
function separate<T extends MusicVideo>(q: T[]): T[] {
  const k = q.map(artistKey)
  const n = q.length
  for (let i = 1; i < n; i++) {
    if (k[i] !== k[i - 1]) continue
    for (let j = i + 1; j < n; j++) {
      const fitsHere = k[j] !== k[i - 1] && (i + 1 >= n || j === i + 1 || k[j] !== k[i + 1])
      const fitsThere = (j - 1 === i || k[j - 1] !== k[i]) && (j + 1 >= n || k[j + 1] !== k[i])
      if (fitsHere && fitsThere) {
        ;[q[i], q[j]] = [q[j], q[i]]
        ;[k[i], k[j]] = [k[j], k[i]]
        break
      }
    }
  }
  return q
}

/** Aleatorio repartido por artista y, dentro de cada artista, por disco */
export function smartShuffle<T extends MusicVideo>(list: T[]): T[] {
  if (list.length < 3) return fisherYates(list)
  return separate(spread(list, artistKey, (group) => spread(group, albumKey)))
}
