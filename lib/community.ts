'use client'

// Comunidad de playlists: compartir playlists y mezclas de tu biblioteca con un nombre público
// (nunca el correo), y las mezclas automáticas de tu biblioteca por género.
import type { MusicVideo } from '@/lib/youtube-music'
import { librarySongs, songArtist, genreOfArtist, genreCacheSnapshot, GENRE_LABELS } from '@/lib/library-radio'
import { smartShuffle } from '@/lib/smart-shuffle'
import { callAccount } from '@/lib/account-sync'
import { useAccountStore } from '@/store/accountStore'

const ALIAS_KEY = 'cpn-community-alias'
export const readAlias = () => {
  try {
    return localStorage.getItem(ALIAS_KEY) || ''
  } catch {
    return ''
  }
}
export const saveAlias = (a: string) => {
  try {
    localStorage.setItem(ALIAS_KEY, a.trim().slice(0, 40))
  } catch {}
}

export interface Mix {
  genre: string
  label: string
  tracks: MusicVideo[]
}

/** Mezclas de tu biblioteca: una por género (con al menos 5 canciones), repartidas por artista */
export function libraryMixes(): Mix[] {
  const cache = genreCacheSnapshot()
  const groups = new Map<string, MusicVideo[]>()
  for (const t of librarySongs()) {
    const g = genreOfArtist(songArtist(t), cache)
    if (!g) continue
    groups.set(g, [...(groups.get(g) ?? []), t])
  }
  return Array.from(groups.entries())
    .filter(([, list]) => list.length >= 5)
    .map(([genre, list]) => ({ genre, label: GENRE_LABELS[genre] || genre, tracks: smartShuffle(list) }))
    .sort((a, b) => b.tracks.length - a.tracks.length)
}

/** Solo lo necesario para que la canción suene en otro teléfono (y su género, para las mezclas) */
function compact(t: MusicVideo) {
  const cache = genreCacheSnapshot()
  const artist = songArtist(t)
  return {
    id: t.id,
    title: t.title.slice(0, 140),
    channelTitle: (t.channelTitle || '').slice(0, 80),
    thumbnail: t.thumbnail?.startsWith('http') ? t.thumbnail : '',
    publishedAt: '',
    description: '',
    ...(t.audioUrl ? { audioUrl: t.audioUrl } : {}),
    ...((t as { artist?: string }).artist ? { artist: (t as { artist?: string }).artist } : {}),
    ...(t.album ? { album: t.album } : {}),
    ...(genreOfArtist(artist, cache) ? { g: genreOfArtist(artist, cache) } : {}),
  }
}

export type PublishResult = { ok: true; count: number } | { ok: false; error: string; needLogin?: boolean; needUpdate?: boolean }

/** Comparte (o actualiza) una playlist o una mezcla en la comunidad */
export async function publish(opts: { key: string; name: string; tracks: MusicVideo[]; kind?: 'playlist' | 'mix'; genre?: string }): Promise<PublishResult> {
  const { token } = useAccountStore.getState()
  if (!token) return { ok: false, error: 'Inicia sesión para compartir', needLogin: true }
  const alias = readAlias()
  if (!alias) return { ok: false, error: 'Falta tu nombre público' }
  const tracks = opts.tracks.filter((t) => !t.streamUrl && !t.id.startsWith('local-')).slice(0, 200).map(compact)
  if (!tracks.length) return { ok: false, error: 'No hay canciones para compartir (las del teléfono no se pueden compartir)' }
  const r = await callAccount<{ count?: number }>({ action: 'publish', token, alias, key: opts.key, name: opts.name, kind: opts.kind ?? 'playlist', genre: opts.genre ?? '', tracks })
  if (r.ok) return { ok: true, count: r.count ?? tracks.length }
  if (r.error === 'session') return { ok: false, error: 'Tu sesión venció: vuelve a entrar', needLogin: true }
  if (/desconocida/i.test(r.error || '')) return { ok: false, error: 'La comunidad aún no está activada en el servidor', needUpdate: true }
  return { ok: false, error: r.error || 'No se pudo compartir' }
}

export async function unpublish(key: string) {
  const { token } = useAccountStore.getState()
  if (!token) return false
  const r = await callAccount({ action: 'unpublish', token, key })
  return r.ok
}

export interface MyShared {
  id: string
  key?: string
  name: string
  kind: string
  genre: string
  tracks: unknown[]
}

/** Lo que compartiste (para quitarlo) */
export async function myShared(): Promise<MyShared[] | null> {
  const { token } = useAccountStore.getState()
  if (!token) return null
  const r = await callAccount<{ playlists?: (MyShared & { mine?: boolean })[] }>({ action: 'community', token })
  if (!r.ok) return null
  return (r.playlists ?? []).filter((p) => p.mine)
}
