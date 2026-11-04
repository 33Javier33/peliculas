'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { isMusicVideo, nextMusicVideo, type VideoRef } from '@/lib/next-music-video'

/**
 * Si lo que se ve es un video musical, deja listo el siguiente (para seguir solo al terminar o con
 * «Siguiente»). Con películas y otros videos no hace nada: devuelve next = null.
 */
export function useNextMusicVideo(cur: VideoRef | null, list: VideoRef[], go: (v: VideoRef) => void, seconds = 0) {
  const [next, setNext] = useState<VideoRef | null>(null)
  const played = useRef(new Set<string>())
  const listRef = useRef(list)
  listRef.current = list
  const music = !!cur && isMusicVideo(cur.title, cur.channel, seconds)
  useEffect(() => {
    setNext(null)
    if (!cur || !music) return
    played.current.add(cur.id)
    let cancelled = false
    nextMusicVideo(cur, listRef.current, played.current)
      .then((v) => !cancelled && setNext(v))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [cur?.id, music]) // eslint-disable-line react-hooks/exhaustive-deps
  const advance = useCallback(() => {
    if (next) go(next)
  }, [next, go])
  return { next: music ? next : null, advance, music }
}
