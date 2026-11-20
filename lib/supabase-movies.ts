import type { WatchEntry, MovieDownload } from '@/store/movieStore'
import { supabasePublic as sb } from '@/lib/supabase-public'

const DEVICE_KEY = 'cpn-movies-device'
export function deviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY)
  if (!id) {
    id = 'dev:' + crypto.randomUUID()
    localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}

export async function pullWatching(userId: string): Promise<Record<string, WatchEntry>> {
  const { data, error } = await sb()
    .from('peliculas_viendo')
    .select('movie_id, movie, t, dur, at')
    .eq('user_id', userId)
    .order('at', { ascending: false })
    .limit(30)
  if (error) throw error
  const out: Record<string, WatchEntry> = {}
  for (const r of data ?? []) out[r.movie_id] = { movie: r.movie, t: r.t, dur: r.dur, at: r.at }
  return out
}

export async function pushWatching(userId: string, entries: Record<string, WatchEntry>, removed: string[]) {
  const rows = Object.entries(entries).map(([movie_id, e]) => ({
    user_id: userId,
    movie_id,
    movie: e.movie,
    t: Math.round(e.t),
    dur: Math.round(e.dur),
    at: e.at,
    updated_at: new Date().toISOString(),
  }))
  if (rows.length) {
    const { error } = await sb().from('peliculas_viendo').upsert(rows, { onConflict: 'user_id,movie_id' })
    if (error) throw error
  }
  if (removed.length) {
    const { error } = await sb().from('peliculas_viendo').delete().eq('user_id', userId).in('movie_id', removed)
    if (error) throw error
  }
}

export async function pushDownloads(userId: string, entries: Record<string, MovieDownload>, removed: string[]) {
  const rows = Object.entries(entries).map(([movie_id, d]) => ({
    user_id: userId,
    movie_id,
    movie: d.movie,
    url: d.url,
    parts: d.parts,
    size: d.size,
    total: d.total,
    mime: d.mime,
    done: d.done,
    saved_at: d.savedAt,
    updated_at: new Date().toISOString(),
  }))
  if (rows.length) {
    const { error } = await sb().from('peliculas_descargas').upsert(rows, { onConflict: 'user_id,movie_id' })
    if (error) throw error
  }
  if (removed.length) {
    const { error } = await sb().from('peliculas_descargas').delete().eq('user_id', userId).in('movie_id', removed)
    if (error) throw error
  }
}
