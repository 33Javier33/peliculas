// Videos musicales: al terminar uno, sigue el siguiente (de la lista que se estaba viendo o de un
// artista parecido). Las películas y los demás videos no siguen solos.
import { decodeEntities } from '@/lib/youtube-music'
import type { YouTubeSearchItem } from '@/lib/youtube'

export interface VideoRef {
  id: string
  title: string
  channel: string
}

const MOVIE = /pel[ií]cula|movie|film completo|cap[ií]tulo|episodio|temporada|documental|trailer|tr[aá]iler|serie|noticiero|entrevista|interview|podcast|tutorial|reacci[oó]n|reaction|gameplay/i
const MUSIC = /video oficial|videoclip|official (music )?video|music video|official audio|audio oficial|lyric|letra|visualizer|\bft\.|\bfeat\.|en vivo|live (at|from|in)|\(live\)|acoustic|ac[uú]stico|remix|vevo|- topic$|records|music|m[uú]sica/i

/** ¿Es un video musical? (por el título, el canal y, si se sabe, que dure menos de 15 minutos) */
export function isMusicVideo(title: string, channel = '', seconds = 0): boolean {
  if (seconds > 15 * 60) return false
  if (MOVIE.test(title)) return false
  return MUSIC.test(`${title} ${channel}`) || /^[^-–]{2,40}\s[-–]\s[^-–]{2,80}$/.test(title.replace(/\(.*?\)|\[.*?\]/g, '').trim())
}

/** Artista de un video ("Soda Stereo - De Música Ligera (Video Oficial)" → "Soda Stereo") */
export function videoArtist(v: VideoRef): string {
  const m = v.title.match(/^(.+?)\s[-–—]\s/)
  return (m ? m[1] : v.channel).replace(/vevo$/i, '').replace(/\s*-\s*topic$/i, '').replace(/\s*(official|oficial)$/i, '').trim()
}

const toRef = (it: YouTubeSearchItem): VideoRef => ({ id: it.id.videoId, title: decodeEntities(it.snippet.title), channel: decodeEntities(it.snippet.channelTitle) })

async function search(q: string): Promise<VideoRef[]> {
  const d = (await fetch(`/api/youtube/search?lang=todo&q=${encodeURIComponent(q)}`)
    .then((r) => (r.ok ? r.json() : { items: [] }))
    .catch(() => ({ items: [] }))) as { items?: YouTubeSearchItem[] }
  return (d.items ?? []).filter((it) => it.id?.videoId).map(toRef)
}

/**
 * Siguiente video musical: primero el que sigue en la lista que se estaba viendo; si no hay, uno de
 * un artista parecido (Deezer) o, si no, otro del mismo artista. Nunca uno que ya sonó.
 */
export async function nextMusicVideo(cur: VideoRef, list: VideoRef[], played: Set<string>): Promise<VideoRef | null> {
  const i = list.findIndex((v) => v.id === cur.id)
  const fromList = list.slice(i + 1).find((v) => !played.has(v.id) && isMusicVideo(v.title, v.channel))
  if (fromList) return fromList
  const artist = videoArtist(cur)
  if (!artist) return null
  const sim = (await fetch(`/api/catalog/similar?name=${encodeURIComponent(artist)}`)
    .then((r) => (r.ok ? r.json() : { tracks: [] }))
    .catch(() => ({ tracks: [] }))) as { tracks?: { title: string; channelTitle: string }[] }
  const others = (sim.tracks ?? []).filter((t) => t.channelTitle.toLowerCase() !== artist.toLowerCase())
  for (const t of others.sort(() => Math.random() - 0.5).slice(0, 3)) {
    const found = (await search(`${t.title} video oficial`)).find((v) => !played.has(v.id) && isMusicVideo(v.title, v.channel))
    if (found) return found
  }
  return (await search(`${artist} video oficial`)).find((v) => !played.has(v.id) && isMusicVideo(v.title, v.channel)) ?? null
}

/** Siguiente de un video que no es música: el próximo de la lista o, si no hay, otro del mismo canal */
export async function nextOtherVideo(cur: VideoRef, list: VideoRef[], played: Set<string>): Promise<VideoRef | null> {
  const i = list.findIndex((v) => v.id === cur.id)
  const fromList = list.slice(i + 1).find((v) => !played.has(v.id))
  if (fromList) return fromList
  if (!cur.channel) return null
  return (await search(cur.channel)).find((v) => !played.has(v.id) && v.channel === cur.channel) ?? null
}
