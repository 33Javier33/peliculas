// ¿Este video de YouTube es la canción que se busca? (del artista correcto y no un cover,
// karaoke, versión en vivo o remix que no se pidió). Lo usan el servidor y el teléfono.

export const normText = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' y ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Título principal de la canción, sin "(feat. …)", "[Remastered]", etc. */
const mainTitle = (t: string) =>
  normText(t.replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/\s[-–]\s.*$/, ' ').replace(/\b(feat|ft)\b.*$/i, ' '))

/** Artista principal (el primero de "A, B & C feat. D") */
const mainArtist = (a: string) => normText(a.split(/,|&|\bfeat\b|\bft\b|\bx\b|\by\b/i)[0] || a)

const UNWANTED = ['cover', 'karaoke', 'instrumental', 'en vivo', 'live', 'remix', 'acustico', 'acoustic', 'reaccion', 'reaction', 'tutorial', 'sped up', 'slowed', 'nightcore', '8d']

/**
 * Puntaje de un video para la canción (mayor es mejor) o -1 si no es esa canción.
 * Exige el artista (en el título o en el canal) y el título de la canción.
 */
export function trackScore(
  cand: { title: string; channel?: string; seconds?: number },
  artist: string,
  title: string,
  duration = 0
): number {
  const ct = normText(cand.title)
  const ch = normText(cand.channel || '')
  const a = mainArtist(artist)
  const t = mainTitle(title)
  if (!t) return -1
  const words = t.split(' ').filter((w) => w.length > 1)
  const found = words.filter((w) => ` ${ct} `.includes(` ${w} `)).length
  if (words.length && found / words.length < 0.75) return -1
  if (a && !` ${ct} ${ch} `.includes(` ${a} `) && !ch.replace(/ /g, '').includes(a.replace(/ /g, ''))) return -1
  const wanted = normText(title)
  for (const u of UNWANTED) if (` ${ct} `.includes(` ${u} `) && !` ${wanted} `.includes(` ${u} `)) return -1
  let score = 1
  if (/ topic$/.test(ch)) score += 3 // "Artista - Topic": el audio oficial
  if (ch.replace(/ /g, '').includes(a.replace(/ /g, ''))) score += 2
  if (/official audio|audio oficial|official video|video oficial/.test(ct)) score += 1
  if (duration && cand.seconds) {
    const diff = Math.abs(cand.seconds - duration)
    if (diff <= 10) score += 2
    else if (diff > 90) score -= 2
  }
  return score
}

/** El mejor candidato que sea esa canción, o null */
export function bestTrack<T extends { title: string; channel?: string; seconds?: number }>(
  list: T[],
  artist: string,
  title: string,
  duration = 0
): T | null {
  let best: T | null = null
  let bestScore = -1
  for (const c of list) {
    const s = trackScore(c, artist, title, duration)
    if (s > bestScore) {
      best = c
      bestScore = s
    }
  }
  return bestScore >= 0 ? best : null
}
