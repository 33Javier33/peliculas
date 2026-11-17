// ============================================================
// Cliente Supabase para películas
// Integración con socios-comicion-propina para almacenamiento
// ============================================================

import { createClient } from '@supabase/supabase-js'
import type { FreeMovie } from '@/lib/pluto'
import type { WatchEntry, MovieDownload } from '@/store/movieStore'

// URL y claves del proyecto Supabase: socios-comicion-propina
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://teemahksasdougehrcly.supabase.co'
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlZW1haGtzYXNkb3VnZWhyY2x5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyOTkwNjIsImV4cCI6MjA5Njg3NTA2Mn0.EIQ7gRcwf3zYgvGESKw3s5lnZMABN_EuNWsrJK3L1zk'

// Crear cliente Supabase único para películas
let supabaseClient: ReturnType<typeof createClient> | null = null

export function getSupabaseClient() {
  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY)
  }
  return supabaseClient
}

// ── Tipos ──────────────────────────────────────────────────
export interface MovieRow {
  id: string
  source: 'archive_es' | 'archive_classic' | 'pluto' | 'cinelatino'
  title: string
  summary?: string
  url?: string
  poster?: string
  duration?: number
  genre?: string
  year?: number
  director?: string
  created_at: string
  updated_at: string
}

export interface WatchingRow {
  id: string
  movie_id: string
  user_id: string
  progress_seconds: number
  total_duration?: number
  watched_at: string
  created_at: string
  updated_at: string
}

export interface DownloadRow {
  id: string
  movie_id: string
  user_id: string
  url?: string
  parts_downloaded: number
  size_downloaded: number
  total_size: number
  mime_type: string
  is_complete: boolean
  saved_at: string
  created_at: string
  updated_at: string
}

// ── Películas (Catálogo) ───────────────────────────────────

export async function addMovie(movie: FreeMovie, source: 'archive_es' | 'archive_classic' | 'pluto' | 'cinelatino'): Promise<MovieRow | null> {
  try {
    const sb = getSupabaseClient()
    const { data, error } = await sb
      .from('movies')
      .insert({
        id: movie.id || undefined,
        source,
        title: movie.title,
        summary: movie.summary?.slice(0, 400),
        url: movie.url,
        poster: movie.poster || movie.posterUrl,
        duration: movie.duration,
        genre: movie.genre,
        year: movie.year,
        director: movie.director,
      })
      .select()
      .single()

    if (error) {
      console.warn('[SB-MOVIES] addMovie error:', error.message)
      return null
    }
    return data
  } catch (e) {
    console.error('[SB-MOVIES] addMovie exception:', e)
    return null
  }
}

export async function getMoviesBySource(source: string): Promise<MovieRow[]> {
  try {
    const sb = getSupabaseClient()
    const { data, error } = await sb
      .from('movies')
      .select('*')
      .eq('source', source)
      .order('created_at', { ascending: false })

    if (error) {
      console.warn('[SB-MOVIES] getMoviesBySource error:', error.message)
      return []
    }
    return data || []
  } catch (e) {
    console.error('[SB-MOVIES] getMoviesBySource exception:', e)
    return []
  }
}

// ── Seguir Viendo (Watching) ───────────────────────────────

export async function saveWatchProgress(movie: FreeMovie, progressSeconds: number, totalDuration: number, userId: string = 'default-user'): Promise<WatchingRow | null> {
  try {
    if (!progressSeconds || !Number.isFinite(progressSeconds)) return null
    if (progressSeconds < 30) return null
    if (totalDuration && (progressSeconds > totalDuration - 90 || progressSeconds / totalDuration > 0.95)) {
      // Película casi terminada: se elimina del historial
      return deleteWatchingEntry(movie.id, userId)
    }

    const sb = getSupabaseClient()
    const { data, error } = await sb
      .from('movie_watching')
      .upsert({
        movie_id: movie.id,
        user_id: userId,
        progress_seconds: progressSeconds,
        total_duration: totalDuration,
        watched_at: new Date().toISOString(),
      }, { onConflict: 'movie_id,user_id' })
      .select()
      .single()

    if (error) {
      console.warn('[SB-MOVIES] saveWatchProgress error:', error.message)
      return null
    }
    return data
  } catch (e) {
    console.error('[SB-MOVIES] saveWatchProgress exception:', e)
    return null
  }
}

export async function getWatchingList(userId: string = 'default-user'): Promise<WatchingRow[]> {
  try {
    const sb = getSupabaseClient()
    const { data, error } = await sb
      .from('movie_watching')
      .select('*')
      .eq('user_id', userId)
      .order('watched_at', { ascending: false })
      .limit(30)

    if (error) {
      console.warn('[SB-MOVIES] getWatchingList error:', error.message)
      return []
    }
    return data || []
  } catch (e) {
    console.error('[SB-MOVIES] getWatchingList exception:', e)
    return []
  }
}

export async function deleteWatchingEntry(movieId: string, userId: string = 'default-user'): Promise<WatchingRow | null> {
  try {
    const sb = getSupabaseClient()
    const { data, error } = await sb
      .from('movie_watching')
      .delete()
      .eq('movie_id', movieId)
      .eq('user_id', userId)
      .select()
      .maybeSingle()

    if (error) {
      console.warn('[SB-MOVIES] deleteWatchingEntry error:', error.message)
      return null
    }
    return data
  } catch (e) {
    console.error('[SB-MOVIES] deleteWatchingEntry exception:', e)
    return null
  }
}

// ── Películas Descargadas ──────────────────────────────────

export async function saveDownloadProgress(
  movie: FreeMovie,
  url: string,
  partsDownloaded: number,
  sizeDownloaded: number,
  totalSize: number,
  mimeType: string = 'video/mp4',
  isComplete: boolean = false,
  userId: string = 'default-user'
): Promise<DownloadRow | null> {
  try {
    const sb = getSupabaseClient()
    const { data, error } = await sb
      .from('movie_downloads')
      .upsert({
        movie_id: movie.id,
        user_id: userId,
        url,
        parts_downloaded: partsDownloaded,
        size_downloaded: sizeDownloaded,
        total_size: totalSize,
        mime_type: mimeType,
        is_complete: isComplete,
        saved_at: new Date().toISOString(),
      }, { onConflict: 'movie_id,user_id' })
      .select()
      .single()

    if (error) {
      console.warn('[SB-MOVIES] saveDownloadProgress error:', error.message)
      return null
    }
    return data
  } catch (e) {
    console.error('[SB-MOVIES] saveDownloadProgress exception:', e)
    return null
  }
}

export async function getDownloadsList(userId: string = 'default-user'): Promise<DownloadRow[]> {
  try {
    const sb = getSupabaseClient()
    const { data, error } = await sb
      .from('movie_downloads')
      .select('*')
      .eq('user_id', userId)
      .order('saved_at', { ascending: false })

    if (error) {
      console.warn('[SB-MOVIES] getDownloadsList error:', error.message)
      return []
    }
    return data || []
  } catch (e) {
    console.error('[SB-MOVIES] getDownloadsList exception:', e)
    return []
  }
}

export async function deleteDownload(movieId: string, userId: string = 'default-user'): Promise<DownloadRow | null> {
  try {
    const sb = getSupabaseClient()
    const { data, error } = await sb
      .from('movie_downloads')
      .delete()
      .eq('movie_id', movieId)
      .eq('user_id', userId)
      .select()
      .maybeSingle()

    if (error) {
      console.warn('[SB-MOVIES] deleteDownload error:', error.message)
      return null
    }
    return data
  } catch (e) {
    console.error('[SB-MOVIES] deleteDownload exception:', e)
    return null
  }
}

export async function getCompleteDownloads(userId: string = 'default-user'): Promise<DownloadRow[]> {
  try {
    const sb = getSupabaseClient()
    const { data, error } = await sb
      .from('movie_downloads')
      .select('*')
      .eq('user_id', userId)
      .eq('is_complete', true)
      .order('saved_at', { ascending: false })

    if (error) {
      console.warn('[SB-MOVIES] getCompleteDownloads error:', error.message)
      return []
    }
    return data || []
  } catch (e) {
    console.error('[SB-MOVIES] getCompleteDownloads exception:', e)
    return []
  }
}

// ── Sincronización offline-first ────────────────────────

/**
 * Sincroniza el estado local (localStorage) con Supabase
 * Se ejecuta en background cuando hay conexión
 */
export async function syncWatchingWithSupabase(localWatching: Record<string, WatchEntry>, userId: string = 'default-user'): Promise<void> {
  try {
    for (const [movieId, entry] of Object.entries(localWatching)) {
      await saveWatchProgress(entry.movie, entry.t, entry.dur, userId)
    }
    console.log('[SB-MOVIES] ✅ Sincronización de watching completada')
  } catch (e) {
    console.warn('[SB-MOVIES] Error sincronizando watching:', e)
  }
}

export async function syncDownloadsWithSupabase(localDownloads: Record<string, MovieDownload>, userId: string = 'default-user'): Promise<void> {
  try {
    for (const [movieId, download] of Object.entries(localDownloads)) {
      await saveDownloadProgress(
        download.movie,
        download.url,
        download.parts,
        download.size,
        download.total,
        download.mime,
        download.done,
        userId
      )
    }
    console.log('[SB-MOVIES] ✅ Sincronización de downloads completada')
  } catch (e) {
    console.warn('[SB-MOVIES] Error sincronizando downloads:', e)
  }
}
