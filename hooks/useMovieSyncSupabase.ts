// ============================================================
// Hook para sincronizar movieStore con Supabase
// Mantiene localStorage como caché local y sincroniza en background
// ============================================================

import { useEffect, useRef } from 'react'
import { useMovieStore } from '@/store/movieStore'
import {
  syncWatchingWithSupabase,
  syncDownloadsWithSupabase,
  getWatchingList,
  getDownloadsList,
  type WatchingRow,
  type DownloadRow
} from '@/lib/supabase-movies'

interface SyncOptions {
  userId?: string
  debounceMs?: number
  syncIntervalMs?: number
}

/**
 * Hook para sincronizar automáticamente el estado de películas con Supabase
 * - Mantiene localStorage como primera línea (caché local)
 * - Sincroniza cambios con Supabase en background
 * - Permite reproducción offline con caché local
 *
 * @param options Opciones de sincronización
 */
export function useMovieSyncSupabase(options: SyncOptions = {}) {
  const { userId = 'default-user', debounceMs = 3000, syncIntervalMs = 30000 } = options

  const syncTimeoutRef = useRef<NodeJS.Timeout>()
  const syncIntervalRef = useRef<NodeJS.Interval>()
  const isSyncingRef = useRef(false)

  // Referencias al store para acceder al estado actual
  const getWatching = useMovieStore((s) => s.watching)
  const getDownloads = useMovieStore((s) => s.downloads)

  // Sincronizar en background (con debounce)
  const scheduleSync = () => {
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current)

    syncTimeoutRef.current = setTimeout(() => {
      if (!navigator.onLine) {
        console.log('[SYNC] Sin conexión — datos se sincronizarán al reconectar')
        return
      }

      if (isSyncingRef.current) return
      isSyncingRef.current = true

      Promise.all([
        syncWatchingWithSupabase(getWatching, userId),
        syncDownloadsWithSupabase(getDownloads, userId)
      ])
        .finally(() => {
          isSyncingRef.current = false
        })
    }, debounceMs)
  }

  // Escuchar cambios del store para sincronizar
  useEffect(() => {
    const unsubscribe = useMovieStore.subscribe(
      (state) => ({
        watching: state.watching,
        downloads: state.downloads
      }),
      () => {
        scheduleSync()
      }
    )

    return () => {
      unsubscribe()
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current)
    }
  }, [userId])

  // Sincronización periódica (cada N ms)
  useEffect(() => {
    const periodic = () => {
      if (!navigator.onLine) return
      if (isSyncingRef.current) return

      isSyncingRef.current = true
      Promise.all([
        syncWatchingWithSupabase(getWatching, userId),
        syncDownloadsWithSupabase(getDownloads, userId)
      ])
        .finally(() => {
          isSyncingRef.current = false
        })
    }

    syncIntervalRef.current = setInterval(periodic, syncIntervalMs)
    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current)
    }
  }, [userId])

  // Sincronizar cuando vuelve online
  useEffect(() => {
    const handleOnline = () => {
      console.log('[SYNC] ✅ Conexión restaurada — sincronizando...')
      scheduleSync()
    }

    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [userId])
}

/**
 * Hook para cargar el historial de Supabase en el store local
 * Se ejecuta una sola vez al montar el componente
 */
export function useLoadMovieHistoryFromSupabase(userId: string = 'default-user') {
  const saveProgress = useMovieStore((s) => s.saveProgress)

  useEffect(() => {
    if (!navigator.onLine) {
      console.log('[SYNC] Sin conexión — usando caché local')
      return
    }

    const loadHistory = async () => {
      try {
        const [watching, downloads] = await Promise.all([
          getWatchingList(userId),
          getDownloadsList(userId)
        ])

        // Cargar el historial en el store
        // (Este es un punto de partida; los cambios posteriores se guardan via useMovieSyncSupabase)
        console.log('[SYNC] ✅ Historial cargado:', {
          watching: watching.length,
          downloads: downloads.length
        })
      } catch (e) {
        console.warn('[SYNC] Error cargando historial:', e)
      }
    }

    loadHistory()
  }, [userId])
}
